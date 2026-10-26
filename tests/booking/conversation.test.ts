import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { changeAppointmentStatus } from "@/lib/services/appointments";
import { anonymizePatient } from "@/lib/services/patients";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STRANGER = "+5511911112222";
const KNOWN = "+5511987654321";

describe("booking conversation", () => {
  let clinic: string;
  let dentistId: string;
  let avaliacaoId: string;
  let clareamentoId: string;
  let counter = 0;

  beforeEach(async () => {
    counter = 0;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    dentistId = (await createDentist(prisma, clinic, "Dra. Ana")).id;
    avaliacaoId = (await createProcedure(prisma, clinic, "Avaliação")).id;
    clareamentoId = (await createProcedure(prisma, clinic, "Clareamento dental")).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const say = (text: string, phone = STRANGER, now = NOW, id?: string) =>
    handleInboundMessage(prisma, { instance: "x", organizationId: clinic, phoneE164: phone, text, messageId: id ?? `m${++counter}` }, now, { ai: null });
  const conversation = (phone = STRANGER) => prisma.conversation.findFirstOrThrow({ where: { phoneE164: phone }, orderBy: { createdAt: "desc" } });
  const replies = (phone = STRANGER) =>
    prisma.reminder.findMany({ where: { kind: "REPLY_FLOW", conversation: { phoneE164: phone } }, orderBy: { createdAt: "asc" } });
  const lastReply = async (phone = STRANGER) => (await replies(phone)).at(-1)?.text ?? "";

  /** Walks a stranger up to the slot menu for "Clareamento dental". */
  async function reachSlots() {
    await say("Oi, quero marcar uma consulta");
    await say("2"); // Clareamento dental
    await say("1"); // for myself
    await say("Ana Souza");
  }

  describe("starting over", () => {
    it("lets the person write 'recomeçar' to begin again, once per delivery", async () => {
      await reachSlots();
      expect(await conversation()).toMatchObject({ step: "SLOT", name: "Ana Souza" });

      expect(await say("Recomeçar", STRANGER, NOW, "reset-1")).toMatchObject({ outcome: "CONVERSATION" });

      const fresh = await conversation();
      expect(fresh).toMatchObject({ status: "OPEN", step: "PROCEDURE", procedureId: null, name: null });
      expect(await prisma.conversation.count({ where: { status: "OPEN" } })).toBe(1);
      expect(await lastReply()).toContain("Em que posso te ajudar?");

      expect(await say("Recomeçar", STRANGER, NOW, "reset-1")).toEqual({ outcome: "IGNORED" });
      expect(await prisma.conversation.count()).toBe(2);
    });

    it("starts over and greets once when 'recomeçar' and a hello come in the same burst", async () => {
      await reachSlots();
      const before = (await replies()).length;
      const restart = () =>
        handleInboundMessage(prisma, { instance: "x", organizationId: clinic, phoneE164: STRANGER, text: "oi, bom dia!", messageId: "burst-1", restart: true }, NOW, { ai: null });

      expect(await restart()).toMatchObject({ outcome: "CONVERSATION" });

      expect(await conversation()).toMatchObject({ status: "OPEN", step: "PROCEDURE", procedureId: null, name: null });
      expect(await replies()).toHaveLength(before + 1);
      expect(await lastReply()).toMatch(/^Bom dia! Aqui é o atendimento/);
      expect(await restart()).toEqual({ outcome: "IGNORED" });
      expect(await replies()).toHaveLength(before + 1);
    });

    it("does nothing for a clinic with booking turned off, and for someone who opted out", async () => {
      await prisma.clinicSettings.update({ where: { organizationId: clinic }, data: { bookingEnabled: false } });
      expect(await say("recomeçar")).toEqual({ outcome: "IGNORED" });
      await prisma.clinicSettings.update({ where: { organizationId: clinic }, data: { bookingEnabled: true } });
      await prisma.patient.create({ data: { organizationId: clinic, name: "Rita", phoneE164: "+5511977776666", doNotContact: true } });
      expect(await say("reiniciar", "+5511977776666")).toEqual({ outcome: "IGNORED" });
    });
  });

  describe("greetings", () => {
    it("answers 'bom dia', 'boa tarde' and 'boa noite' in kind", async () => {
      await say("Bom dia!");
      expect(await lastReply()).toMatch(/^Bom dia! /);
      await say("oi, boa noite", "+5511933334444");
      expect(await lastReply("+5511933334444")).toMatch(/^Boa noite! /);
    });

    it("greets back a first message that also asks to book", async () => {
      await say("boa tarde, quero marcar uma consulta");
      expect(await lastReply()).toMatch(/^Boa tarde! /);
    });

    it("keeps 'Olá!' for a plain hello", async () => {
      await say("oi");
      expect(await lastReply()).toMatch(/^Olá! /);
    });
  });

  describe("a first contact", () => {
    it("is welcomed with the clinic's procedures, without creating anyone yet", async () => {
      expect(await say("Oi, quero marcar uma consulta")).toMatchObject({ outcome: "CONVERSATION" });

      expect(await conversation()).toMatchObject({ status: "OPEN", step: "PROCEDURE", patientId: null });
      const text = await lastReply();
      expect(text).toContain("*Clinic a*");
      expect(text).toContain("*1* Avaliação");
      expect(text).toContain("*2* Clareamento dental");
      expect(await prisma.patient.count()).toBe(0);
    });

    it("is guided through procedure, name, slot and confirmation to a pending request", async () => {
      await reachSlots();
      expect(await conversation()).toMatchObject({ step: "SLOT", name: "Ana Souza", procedureId: clareamentoId });
      const slots = await lastReply();
      expect(slots).toMatch(/\*1\* .*às \d\d:\d\d/);
      expect(slots).toContain("Dra. Ana");
      expect(slots).toContain("*4*");

      await say("2");
      expect(await conversation()).toMatchObject({ step: "CONFIRM" });
      expect(await lastReply()).toContain("*1*");

      expect(await say("1")).toMatchObject({ outcome: "BOOKING_REQUESTED" });

      const patient = await prisma.patient.findFirstOrThrow();
      expect(patient).toMatchObject({ name: "Ana Souza", phoneE164: STRANGER, status: "PENDING", source: "WHATSAPP", consentSource: "whatsapp_booking" });
      expect(patient.consentAt).toEqual(NOW);
      const appointment = await prisma.appointment.findFirstOrThrow();
      expect(appointment).toMatchObject({ patientId: patient.id, dentistId, procedureId: clareamentoId, status: "PENDING", source: "WHATSAPP" });
      expect(appointment.startsAt.getTime()).toBeGreaterThan(NOW.getTime() + 2 * HOUR);
      expect(await conversation()).toMatchObject({ status: "DONE", name: null, slotOptions: null, appointmentId: appointment.id });
      expect(await lastReply()).toMatch(/pedido|equipe/i);
    });

    it("sees more times on request and can go back to choose another", async () => {
      await reachSlots();
      const first = await conversation();
      await say("4");
      const second = await conversation();
      expect(second.slotOffset).toBe(3);
      expect(JSON.stringify(second.slotOptions)).not.toEqual(JSON.stringify(first.slotOptions));

      await say("1");
      await say("2");
      expect(await conversation()).toMatchObject({ step: "SLOT" });
      expect(await prisma.appointment.count()).toBe(0);
    });

    it("skips the menu when the clinic offers a single procedure", async () => {
      await prisma.procedure.update({ where: { id: avaliacaoId }, data: { active: false } });

      await say("Oi, queria agendar");

      expect(await conversation()).toMatchObject({ step: "WHO", procedureId: clareamentoId });
      await say("1");
      expect(await conversation()).toMatchObject({ step: "NAME" });
    });

    it("is welcomed even without any AI and does not need the clinic to change anything", async () => {
      expect(await say("bom dia")).toMatchObject({ outcome: "CONVERSATION" });
    });
  });

  describe("a patient who is already registered", () => {
    let patientId: string;
    beforeEach(async () => {
      patientId = (await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: KNOWN })).id;
    });

    it("asking to book skips the name step and keeps the existing record", async () => {
      await say("gostaria de agendar uma limpeza", KNOWN);
      expect(await conversation(KNOWN)).toMatchObject({ patientId, step: "PROCEDURE" });

      await say("1", KNOWN);
      expect(await conversation(KNOWN)).toMatchObject({ step: "WHO" });
      await say("1", KNOWN);
      expect(await conversation(KNOWN)).toMatchObject({ step: "SLOT" });
      await say("1", KNOWN);
      await say("1", KNOWN);

      expect(await prisma.patient.count()).toBe(1);
      expect(await prisma.appointment.findFirstOrThrow()).toMatchObject({ patientId, status: "PENDING", source: "WHATSAPP" });
    });

    it("an ordinary message is still kept for the secretary, not turned into a conversation", async () => {
      expect(await say("obrigada pelo lembrete", KNOWN)).toMatchObject({ outcome: "HANDOFF" });
      expect(await prisma.conversation.count()).toBe(0);
    });

    it("while a conversation is open, numbers are menu answers and not confirmations", async () => {
      const startsAt = new Date(NOW.getTime() + DAY);
      const booked = await prisma.appointment.create({
        data: { organizationId: clinic, patientId, dentistId, procedureId: avaliacaoId, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) },
      });
      await say("quero agendar", KNOWN);

      await say("1", KNOWN);

      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: booked.id } })).status).toBe("SCHEDULED");
      expect(await conversation(KNOWN)).toMatchObject({ step: "WHO" });
    });

    it("SAIR always works: the patient is opted out and the conversation closes", async () => {
      await say("quero agendar", KNOWN);
      await say("SAIR", KNOWN);

      expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).doNotContact).toBe(true);
      expect((await conversation(KNOWN)).status).not.toBe("OPEN");
    });
  });

  describe("when things do not go to plan", () => {
    it("hands the person to the secretary on request, keeping the phone for a callback", async () => {
      await say("oi");
      expect(await say("0")).toMatchObject({ outcome: "HANDOFF" });

      expect(await conversation()).toMatchObject({ status: "HANDED_OFF", name: null });
      expect(await prisma.inboundMessage.findFirstOrThrow()).toMatchObject({ patientId: null, phoneE164: STRANGER, status: "OPEN" });
      expect(await lastReply()).toMatch(/equipe/);
    });

    it("hands over after three answers it cannot understand", async () => {
      await say("oi");
      await say("hmm");
      await say("???");
      expect((await conversation()).status).toBe("OPEN");
      await say("sei lá");

      expect((await conversation()).status).toBe("HANDED_OFF");
    });

    it("hands over when there is no free time in the coming days", async () => {
      await prisma.dentist.update({ where: { id: dentistId }, data: { workDays: [] } });
      await say("oi");
      await say("1");
      await say("1");
      expect(await say("Ana Souza")).toMatchObject({ outcome: "HANDOFF" });
      expect((await conversation()).status).toBe("HANDED_OFF");
    });

    it("offers new times when the chosen one was taken in the meantime", async () => {
      await reachSlots();
      await say("1");
      const taken = (await conversation()).chosenStartsAt as Date;
      const other = await createPatient(prisma, clinic, { name: "Outro", phoneE164: "+5511900001111" });
      await prisma.appointment.create({
        data: { organizationId: clinic, patientId: other.id, dentistId, procedureId: avaliacaoId, startsAt: taken, endsAt: new Date(taken.getTime() + 1_800_000) },
      });

      await say("1");

      expect(await prisma.appointment.count({ where: { source: "WHATSAPP" } })).toBe(0);
      expect(await conversation()).toMatchObject({ status: "OPEN", step: "SLOT" });
      expect(await lastReply()).toMatch(/ocupado|outros hor/i);
    });

    it("starts afresh after a day of silence and erases the old name", async () => {
      await reachSlots();
      const later = new Date(NOW.getTime() + 25 * HOUR);

      await say("oi de novo", STRANGER, later);

      const all = await prisma.conversation.findMany({ orderBy: { createdAt: "asc" } });
      expect(all.map((item) => item.status)).toEqual(["EXPIRED", "OPEN"]);
      expect(all[0]).toMatchObject({ name: null, slotOptions: null });
      expect(all[1]?.step).toBe("PROCEDURE");
    });

    it("answers a message delivered twice only once", async () => {
      await say("oi", STRANGER, NOW, "same");
      expect(await say("oi", STRANGER, NOW, "same")).toEqual({ outcome: "IGNORED" });
      expect(await replies()).toHaveLength(1);
    });

    it("ignores first contacts when the clinic turned booking off, and people who only say SAIR", async () => {
      await prisma.clinicSettings.update({ where: { organizationId: clinic }, data: { bookingEnabled: false } });
      expect(await say("oi")).toEqual({ outcome: "UNKNOWN_PATIENT" });
      await prisma.clinicSettings.update({ where: { organizationId: clinic }, data: { bookingEnabled: true } });
      expect(await say("SAIR", "+5511977776666")).toEqual({ outcome: "UNKNOWN_PATIENT" });
      expect(await prisma.conversation.count()).toBe(0);
    });

    it("limits how many new contacts a clinic welcomes in a day", async () => {
      await prisma.conversation.createMany({
        data: Array.from({ length: 30 }, (_, index) => ({ organizationId: clinic, phoneE164: `+55119000000${String(index).padStart(2, "0")}`, status: "DONE" as const, expiresAt: new Date(NOW.getTime() + HOUR), createdAt: new Date(NOW.getTime() - HOUR) })),
      });
      expect(await say("oi")).toEqual({ outcome: "IGNORED" });
    });
  });

  describe("delivery and approval", () => {
    it("hands each turn to n8n as the text the app built", async () => {
      await say("quero agendar");

      const [due] = await claimDueReminders(prisma, { now: NOW });

      expect(due).toMatchObject({ kind: "REPLY_FLOW", patient: { phone: STRANGER }, appointment: null, quote: null });
      expect(due?.message).toContain("*1* Avaliação");
      expect(due?.whatsapp.instance).toContain("bumera-teste");
    });

    it("the secretary's approval also confirms the new patient, so reminders can start", async () => {
      await reachSlots();
      await say("1");
      await say("1");
      const appointment = await prisma.appointment.findFirstOrThrow();

      await changeAppointmentStatus(ctxFor(prisma, clinic, "secretary"), appointment.id, "SCHEDULED");

      expect((await prisma.patient.findFirstOrThrow()).status).toBe("CONFIRMED");
      expect(await prisma.reminder.count({ where: { appointmentId: appointment.id, kind: "CONFIRMATION" } })).toBe(1);
    });

    it("erasing the patient also wipes what the conversation kept", async () => {
      await reachSlots();
      await say("1");
      await say("1");
      const patient = await prisma.patient.findFirstOrThrow();

      await anonymizePatient(ctxFor(prisma, clinic, "admin"), patient.id);

      expect(await prisma.conversation.findFirstOrThrow()).toMatchObject({ name: null, slotOptions: null, status: "DONE" });
    });
  });
});

describe("booking conversation: the first message already says what the person wants", () => {
  let clinic: string;
  let counter = 0;

  beforeEach(async () => {
    counter = 0;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    await createDentist(prisma, clinic, "Dra. Ana");
    await createProcedure(prisma, clinic, "Avaliação");
    await createProcedure(prisma, clinic, "Clareamento dental");
  });

  const say = (text: string, ai: Parameters<typeof handleInboundMessage>[3] = { ai: null }) =>
    handleInboundMessage(prisma, { instance: "x", organizationId: clinic, phoneE164: STRANGER, text, messageId: `n${++counter}` }, NOW, ai);

  it("skips the procedure menu when the first message names a procedure", async () => {
    await say("Oi, quero fazer um clareamento");

    const conv = await prisma.conversation.findFirstOrThrow();
    expect(conv.step).toBe("WHO");
    expect(conv.procedureId).not.toBeNull();
    const reply = await prisma.reminder.findFirstOrThrow({ where: { kind: "REPLY_FLOW" } });
    expect(reply.text).toContain("para outra pessoa");
  });

  it("still shows the menu when the message does not name one clearly", async () => {
    await say("Oi, quero marcar uma consulta");
    expect((await prisma.conversation.findFirstOrThrow()).step).toBe("PROCEDURE");
  });
});
