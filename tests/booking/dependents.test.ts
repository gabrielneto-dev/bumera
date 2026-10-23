import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { detectWhom } from "@/lib/booking/text";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { renderReminderMessage } from "@/lib/reminders/messages";
import { anonymizePatient } from "@/lib/services/patients";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PHONE = "+5511987654321";

describe("detectWhom", () => {
  it.each([
    ["quero marcar uma consulta para meu filho", "other"],
    ["é pra minha esposa", "other"],
    ["para o meu pai", "other"],
    ["é para outra pessoa", "other"],
    ["pra mim mesma", "self"],
    ["é para mim", "self"],
    ["quero marcar uma consulta", null],
    ["quero marcar uma limpeza", null],
  ])("reads %j as %j", (text, expected) => expect(detectWhom(text)).toBe(expected));
});

describe("appointments for someone else", () => {
  let clinic: string;
  let dentistId: string;
  let procedureId: string;
  let counter = 0;

  beforeEach(async () => {
    counter = 0;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    dentistId = (await createDentist(prisma, clinic, "Dra. Ana")).id;
    procedureId = (await createProcedure(prisma, clinic, "Avaliação")).id;
    await createProcedure(prisma, clinic, "Clareamento dental");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const say = (text: string, phone = PHONE) =>
    handleInboundMessage(prisma, { instance: "x", organizationId: clinic, phoneE164: phone, text, messageId: `d${++counter}` }, NOW, { ai: null });
  const conversation = () => prisma.conversation.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  const lastReply = async () => (await prisma.reminder.findMany({ where: { kind: "REPLY_FLOW" }, orderBy: { createdAt: "asc" } })).at(-1)?.text ?? "";

  it("asks who the appointment is for, and understands a relative named up front", async () => {
    await say("Oi, quero marcar uma consulta");
    await say("1");
    expect(await conversation()).toMatchObject({ step: "WHO", forSelf: null });
    expect(await lastReply()).toContain("*2* Para outra pessoa");

    await say("é pro meu filho");
    expect(await conversation()).toMatchObject({ step: "PERSON", forSelf: false });

    await prisma.conversation.updateMany({ data: { status: "EXPIRED" } });
    await say("quero marcar uma consulta para minha esposa");
    expect(await conversation()).toMatchObject({ forSelf: false, step: "PROCEDURE" });
  });

  describe("a registered parent", () => {
    let parentId: string;
    beforeEach(async () => {
      parentId = (await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE })).id;
    });

    async function bookForChild(name = "Pedro Souza") {
      await say("quero marcar uma consulta para meu filho");
      await say("1");
      await say(name);
      await say("1");
      await say("1");
    }

    it("books for the child: a dependent record with the parent's phone and name as the contact", async () => {
      await bookForChild();

      expect(await prisma.patient.count()).toBe(2);
      const child = await prisma.patient.findFirstOrThrow({ where: { name: "Pedro Souza" } });
      expect(child).toMatchObject({ phoneE164: PHONE, guardianName: "Maria Souza", status: "PENDING", source: "WHATSAPP", consentSource: "whatsapp_booking_guardian" });
      expect(await prisma.appointment.findFirstOrThrow()).toMatchObject({ patientId: child.id, status: "PENDING", source: "WHATSAPP" });
      expect(await prisma.patient.findUniqueOrThrow({ where: { id: parentId } })).toMatchObject({ guardianName: null, status: "CONFIRMED" });
    });

    it("shows the person's name when confirming and when the request is registered", async () => {
      await say("quero marcar uma consulta para meu filho");
      await say("1");
      await say("Pedro Souza");
      await say("1");
      expect(await lastReply()).toContain("Paciente: Pedro Souza");
      await say("1");
      expect(await lastReply()).toContain("Pedro Souza");
    });

    it("keeps the same record when the same child is booked again", async () => {
      await bookForChild();
      await prisma.conversation.updateMany({ data: { status: "EXPIRED" } });
      await prisma.appointment.updateMany({ data: { startsAt: new Date(NOW.getTime() + 20 * DAY), endsAt: new Date(NOW.getTime() + 20 * DAY + 1_800_000) } });

      await bookForChild("pedro souza");

      expect(await prisma.patient.count({ where: { guardianName: { not: null } } })).toBe(1);
    });

    it("asking to book for oneself attaches to the adult, not to a dependent sharing the phone", async () => {
      await bookForChild();
      await prisma.conversation.updateMany({ data: { status: "EXPIRED" } });

      await say("quero marcar uma consulta");

      expect((await conversation()).patientId).toBe(parentId);
    });

    it("erasing the parent also removes the contact channel from the child's record", async () => {
      await bookForChild();
      const child = await prisma.patient.findFirstOrThrow({ where: { name: "Pedro Souza" } });

      await anonymizePatient(ctxFor(prisma, clinic, "admin"), parentId);

      expect(await prisma.patient.findUniqueOrThrow({ where: { id: child.id } })).toMatchObject({ phoneE164: "REMOVIDO", guardianName: null, doNotContact: true, name: "Pedro Souza" });
    });
  });

  describe("a first contact writing for someone else", () => {
    it("asks for both names and registers only the person to be attended", async () => {
      await say("Oi, quero marcar");
      await say("1");
      await say("2");
      await say("Pedro Souza");
      expect(await conversation()).toMatchObject({ step: "NAME" });
      expect(await lastReply()).toContain("contato para os avisos");
      await say("Maria Souza");
      await say("1");
      await say("1");

      expect(await prisma.patient.count()).toBe(1);
      expect(await prisma.patient.findFirstOrThrow()).toMatchObject({ name: "Pedro Souza", guardianName: "Maria Souza", phoneE164: PHONE });
      expect(await prisma.appointment.findFirstOrThrow()).toMatchObject({ status: "PENDING" });
    });
  });

  describe("messages about a dependent", () => {
    const base = { clinicName: "Odonto Company", patientName: "Pedro Souza", startsAt: "2026-10-20T13:00:00.000Z", dentistName: "Dra. Ana", procedureName: "Avaliação", guardianName: "Maria Souza" };

    it("greet the guardian and speak of the patient", () => {
      const confirmation = renderReminderMessage({ ...base, kind: "CONFIRMATION" });
      expect(confirmation.split("\n\n")[0]).toBe("Olá, Maria!");
      expect(confirmation).toContain("A consulta de *Pedro* na *Odonto Company* foi agendada.");
      expect(renderReminderMessage({ ...base, kind: "REMINDER_24H" })).toContain("*Pedro* tem uma consulta");
      expect(renderReminderMessage({ ...base, kind: "REMINDER_2H" })).toContain("a consulta de *Pedro*");
      expect(renderReminderMessage({ ...base, kind: "REPLY_CONFIRMED" })).toContain("Consulta de *Pedro* confirmada");
      expect(renderReminderMessage({ ...base, kind: "REPLY_RESCHEDULE" })).toContain("consulta de *Pedro*");
      expect(renderReminderMessage({ ...base, kind: "NO_SHOW_FOLLOWUP" })).toContain("a falta de *Pedro*");
      expect(renderReminderMessage({ ...base, kind: "REACTIVATION" })).toContain("atendimento de *Pedro*");
    });

    it("stay as they were for an ordinary patient", () => {
      const text = renderReminderMessage({ ...base, guardianName: undefined, patientName: "Maria Souza", kind: "CONFIRMATION" });
      expect(text).toContain("Sua consulta na *Odonto Company* foi agendada.");
    });

    it("reach n8n addressed to the guardian, at the shared phone", async () => {
      const child = await prisma.patient.create({
        data: { organizationId: clinic, name: "Pedro Souza", phoneE164: PHONE, guardianName: "Maria Souza", consentAt: NOW },
      });
      const startsAt = new Date(NOW.getTime() + 3 * DAY);
      const appointment = await prisma.appointment.create({
        data: { organizationId: clinic, patientId: child.id, dentistId, procedureId, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) },
      });
      await prisma.reminder.create({ data: { organizationId: clinic, appointmentId: appointment.id, kind: "CONFIRMATION", dueAt: new Date(NOW.getTime() - 60_000) } });

      const [due] = await claimDueReminders(prisma, { now: NOW });

      expect(due?.patient.phone).toBe(PHONE);
      expect(due?.message.split("\n\n")[0]).toBe("Olá, Maria!");
      expect(due?.message).toContain("*Pedro*");
    });
  });

  describe("one phone, several people: which appointment does a reply mean?", () => {
    let parentId: string;
    let childId: string;
    const book = async (patient: string, hoursAhead: number) => {
      const startsAt = new Date(NOW.getTime() + hoursAhead * HOUR);
      return prisma.appointment.create({ data: { organizationId: clinic, patientId: patient, dentistId, procedureId, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) } });
    };
    const sent = (appointmentId: string, minutesAgo: number) =>
      prisma.reminder.create({ data: { organizationId: clinic, appointmentId, kind: "CONFIRMATION", status: "SENT", attempts: 1, dueAt: NOW, sentAt: new Date(NOW.getTime() - minutesAgo * 60_000) } });

    beforeEach(async () => {
      parentId = (await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE })).id;
      childId = (await prisma.patient.create({ data: { organizationId: clinic, name: "Pedro Souza", phoneE164: PHONE, guardianName: "Maria Souza", consentAt: NOW } })).id;
    });

    it("answers the appointment of the latest message sent, then walks to the next one waiting", async () => {
      const parents = await book(parentId, 24);
      const child = await book(childId, 48);
      await sent(parents.id, 30);
      await sent(child.id, 5);

      const first = await say("1");
      expect(first).toMatchObject({ outcome: "CONFIRMED", appointmentId: child.id });
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: parents.id } })).status).toBe("SCHEDULED");
      const note = await prisma.reminder.findFirstOrThrow({ where: { appointmentId: child.id, kind: "REPLY_CONFIRMED" } });
      expect(note.text).toMatch(/1 consulta aguardando confirmação/);

      const second = await say("1");
      expect(second).toMatchObject({ outcome: "CONFIRMED", appointmentId: parents.id });
    });

    it("a reschedule request refers to the latest message too", async () => {
      const parents = await book(parentId, 24);
      const child = await book(childId, 48);
      await sent(parents.id, 30);
      await sent(child.id, 5);

      expect(await say("2")).toMatchObject({ outcome: "RESCHEDULE_REQUESTED", appointmentId: child.id });
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: parents.id } })).rescheduleRequestedAt).toBeNull();
    });

    it("without a recent message, the soonest appointment is used as before", async () => {
      await book(childId, 48);
      const soonest = await book(parentId, 24);
      expect(await say("1")).toMatchObject({ outcome: "CONFIRMED", appointmentId: soonest.id });
    });
  });
});
