import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyPatientAnswer } from "@/lib/n8n-api/answers";
import { createPrismaClient } from "@/lib/prisma";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const PHONE = "+5511987654321";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("answer rules (ported from the inbound handler)", () => {
  let clinic: string;
  let other: string;
  let patientId: string;

  const answer = (value: "CONFIRM" | "RESCHEDULE" | "OPT_OUT", organizationId = clinic) => applyPatientAnswer(prisma, { organizationId, phoneE164: PHONE, answer: value }, NOW);

  async function appointment(organizationId: string, patient: string, startsAt: Date, status: "SCHEDULED" | "CONFIRMED" | "CANCELLED" = "SCHEDULED") {
    const dentist = await createDentist(prisma, organizationId);
    const procedure = await createProcedure(prisma, organizationId);
    return prisma.appointment.create({
      data: { organizationId, patientId: patient, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status },
    });
  }
  const sent = (data: Record<string, unknown>, sentAt: Date) =>
    prisma.reminder.create({ data: { organizationId: clinic, dueAt: sentAt, status: "SENT", sentAt, ...data } as never });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    other = await createClinic(prisma, "b");
    await connectWhatsapp(prisma, clinic);
    await connectWhatsapp(prisma, other);
    patientId = (await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("appointments", () => {
    it("is safe to repeat: confirming twice keeps it confirmed", async () => {
      const item = await appointment(clinic, patientId, new Date(NOW.getTime() + 2 * DAY));
      await answer("CONFIRM");
      expect(await answer("CONFIRM")).toMatchObject({ outcome: "CONFIRMED", appointmentId: item.id });
      expect(await prisma.appointment.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: "CONFIRMED" });
    });

    it("ignores cancelled and past appointments", async () => {
      await appointment(clinic, patientId, new Date(NOW.getTime() + 2 * DAY), "CANCELLED");
      await appointment(clinic, patientId, new Date(NOW.getTime() - 2 * DAY));
      expect(await answer("CONFIRM")).toMatchObject({ outcome: "NO_APPOINTMENT" });
    });

    it("with the same phone in two clinics, answers the appointment of the clinic that was written to", async () => {
      const elsewhere = await createPatient(prisma, other, { phoneE164: PHONE });
      const soonerElsewhere = await appointment(other, elsewhere.id, new Date(NOW.getTime() + DAY));
      const mine = await appointment(clinic, patientId, new Date(NOW.getTime() + 3 * DAY));

      expect(await answer("CONFIRM")).toMatchObject({ appointmentId: mine.id });
      expect(await prisma.appointment.findUniqueOrThrow({ where: { id: soonerElsewhere.id } })).toMatchObject({ status: "SCHEDULED" });
    });

    it("with a parent and a child on one phone, answers the appointment of the latest message sent", async () => {
      const child = await prisma.patient.create({ data: { organizationId: clinic, name: "Pedro Souza", phoneE164: PHONE, guardianName: "Maria Souza", consentAt: NOW } });
      await appointment(clinic, patientId, new Date(NOW.getTime() + DAY));
      const childs = await appointment(clinic, child.id, new Date(NOW.getTime() + 3 * DAY));
      await sent({ appointmentId: childs.id, kind: "REMINDER_24H" }, new Date(NOW.getTime() - HOUR));

      const result = await answer("CONFIRM");

      expect(result).toMatchObject({ outcome: "CONFIRMED", appointmentId: childs.id });
      expect(result.reply).toContain("*Pedro*");
    });
  });

  describe("campaigns", () => {
    let pastId: string;

    beforeEach(async () => {
      pastId = (await appointment(clinic, patientId, new Date(NOW.getTime() - 200 * DAY), "CONFIRMED")).id;
    });

    it("records a refusal, and answers the campaign only once", async () => {
      const campaign = await sent({ appointmentId: pastId, kind: "REACTIVATION" }, new Date(NOW.getTime() - HOUR));

      expect(await answer("RESCHEDULE")).toMatchObject({ outcome: "DECLINED", reply: expect.any(String) });
      expect(await prisma.reminder.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject({ answer: "DECLINED" });
      expect(await answer("CONFIRM")).toMatchObject({ outcome: "NO_APPOINTMENT" });
    });

    it("ignores a campaign message older than two weeks", async () => {
      await sent({ appointmentId: pastId, kind: "REACTIVATION" }, new Date(NOW.getTime() - 15 * DAY));
      expect(await answer("CONFIRM")).toMatchObject({ outcome: "NO_APPOINTMENT" });
    });

    it("keeps confirming appointments when the latest message was an appointment reminder", async () => {
      await sent({ appointmentId: pastId, kind: "REACTIVATION" }, new Date(NOW.getTime() - 2 * HOUR));
      const upcoming = await appointment(clinic, patientId, new Date(NOW.getTime() + 2 * DAY));
      await sent({ appointmentId: upcoming.id, kind: "REMINDER_24H" }, new Date(NOW.getTime() - HOUR));

      expect(await answer("CONFIRM")).toMatchObject({ outcome: "CONFIRMED", appointmentId: upcoming.id });
    });

    it("declining a quote follow-up closes the quote and stops the next follow-up", async () => {
      const quote = await prisma.quote.create({ data: { organizationId: clinic, patientId, description: "Implante dente 36", createdAt: new Date(NOW.getTime() - 2 * DAY) } });
      await sent({ quoteId: quote.id, kind: "QUOTE_FOLLOWUP_1" }, new Date(NOW.getTime() - HOUR));
      await prisma.reminder.create({ data: { organizationId: clinic, quoteId: quote.id, kind: "QUOTE_FOLLOWUP_2", dueAt: new Date(NOW.getTime() + 5 * DAY) } });

      expect(await answer("RESCHEDULE")).toMatchObject({ outcome: "DECLINED", quoteId: quote.id });
      expect(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ status: "DECLINED" });
      expect(await prisma.reminder.findFirstOrThrow({ where: { quoteId: quote.id, kind: "QUOTE_FOLLOWUP_2" } })).not.toMatchObject({ status: "PENDING" });
    });

    it("still opts out on SAIR", async () => {
      await sent({ appointmentId: pastId, kind: "REACTIVATION" }, new Date(NOW.getTime() - HOUR));
      expect(await answer("OPT_OUT")).toMatchObject({ outcome: "OPTED_OUT" });
    });
  });
});
