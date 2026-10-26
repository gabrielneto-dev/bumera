import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { applyPatientAnswer } from "@/lib/n8n-api/answers";
import { describeContact, findClinicByInstance } from "@/lib/n8n-api/clinic";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const PHONE = "+5511987654321";
const HOUR = 3_600_000;

describe("API for the n8n WhatsApp workflows: clinic, contact and answers", () => {
  let clinic: string;
  let other: string;
  let patientId: string;
  let appointmentId: string;

  async function appointment(patient: string, startsAt: Date, status: "SCHEDULED" | "CONFIRMED" = "SCHEDULED") {
    const dentist = await createDentist(prisma, clinic, "Dra. Ana");
    const procedure = await createProcedure(prisma, clinic, "Limpeza");
    return prisma.appointment.create({
      data: { organizationId: clinic, patientId: patient, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status },
    });
  }

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    other = await createClinic(prisma, "b");
    await connectWhatsapp(prisma, clinic);
    await prisma.clinicSettings.update({ where: { organizationId: clinic }, data: { clinicInfo: "Rua A, 10. Seg a sex, 8h-18h." } });
    patientId = (await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE })).id;
    appointmentId = (await appointment(patientId, new Date(NOW.getTime() + 48 * HOUR))).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("findClinicByInstance", () => {
    it("tells which clinic a WhatsApp number belongs to, with what the AI may answer from", async () => {
      expect(await findClinicByInstance(prisma, "bumera-teste")).toEqual({ id: clinic, name: "Clinic a", info: "Rua A, 10. Seg a sex, 8h-18h.", bookingEnabled: true });
    });

    it("throws NOT_FOUND for an unknown instance", async () => {
      await expect(findClinicByInstance(prisma, "nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("describeContact", () => {
    it("describes a known patient by first name with upcoming appointments, never the full name or CPF", async () => {
      const contact = await describeContact(prisma, clinic, PHONE, NOW);

      expect(contact).toMatchObject({ known: true, optedOut: false, awaitingAnswer: "appointment" });
      expect(contact.patients).toEqual([{ id: patientId, firstName: "Maria", dependent: false }]);
      expect(contact.upcoming).toEqual([expect.objectContaining({ id: appointmentId, status: "SCHEDULED", dentist: "Dra. Ana", procedure: "Limpeza", patientFirstName: "Maria" })]);
      expect(JSON.stringify(contact)).not.toContain("Souza");
    });

    it("finds the patient when WhatsApp drops the ninth digit", async () => {
      expect((await describeContact(prisma, clinic, "+551187654321", NOW)).known).toBe(true);
    });

    it("knows nobody for another clinic or an unknown number", async () => {
      expect(await describeContact(prisma, other, PHONE, NOW)).toMatchObject({ known: false, patients: [], upcoming: [], awaitingAnswer: null });
    });
  });

  describe("applyPatientAnswer", () => {
    it("confirms the appointment the patient is answering and returns the reply to send", async () => {
      const result = await applyPatientAnswer(prisma, { organizationId: clinic, phoneE164: PHONE, answer: "CONFIRM" }, NOW);

      expect(result).toMatchObject({ outcome: "CONFIRMED", appointmentId });
      expect(result.reply).toContain("confirmada");
      expect(await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).toMatchObject({ status: "CONFIRMED" });
    });

    it("records a reschedule request for the secretary and stops the appointment's reminders", async () => {
      await prisma.reminder.create({ data: { organizationId: clinic, appointmentId, kind: "REMINDER_24H", dueAt: new Date(NOW.getTime() + 24 * HOUR) } });

      const result = await applyPatientAnswer(prisma, { organizationId: clinic, phoneE164: PHONE, answer: "RESCHEDULE" }, NOW);

      expect(result).toMatchObject({ outcome: "RESCHEDULE_REQUESTED", appointmentId });
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).rescheduleRequestedAt).not.toBeNull();
      expect(await prisma.reminder.findFirstOrThrow({ where: { appointmentId, kind: "REMINDER_24H" } })).toMatchObject({ status: "CANCELLED" });
    });

    it("opts out every record of the phone in this clinic only, and skips their pending reminders", async () => {
      const elsewhere = await createPatient(prisma, other, { phoneE164: PHONE });
      await prisma.reminder.create({ data: { organizationId: clinic, appointmentId, kind: "REMINDER_24H", dueAt: new Date(NOW.getTime() + 24 * HOUR) } });

      const result = await applyPatientAnswer(prisma, { organizationId: clinic, phoneE164: PHONE, answer: "OPT_OUT" }, NOW);

      expect(result).toMatchObject({ outcome: "OPTED_OUT" });
      expect(result.reply).toContain("não vai mais receber");
      expect(await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).toMatchObject({ doNotContact: true });
      expect(await prisma.patient.findUniqueOrThrow({ where: { id: elsewhere.id } })).toMatchObject({ doNotContact: false });
      expect(await prisma.reminder.findFirstOrThrow({ where: { appointmentId } })).toMatchObject({ status: "SKIPPED" });
      expect((await describeContact(prisma, clinic, PHONE, NOW)).optedOut).toBe(true);
    });

    it("answers a campaign message with interest or a decline", async () => {
      await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CONFIRMED" } });
      const past = await appointment(patientId, new Date(NOW.getTime() - 200 * 24 * HOUR), "CONFIRMED");
      await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });
      const campaign = await prisma.reminder.create({
        data: { organizationId: clinic, appointmentId: past.id, kind: "REACTIVATION", dueAt: NOW, status: "SENT", sentAt: new Date(NOW.getTime() - HOUR) },
      });

      const result = await applyPatientAnswer(prisma, { organizationId: clinic, phoneE164: PHONE, answer: "CONFIRM" }, NOW);

      expect(result).toMatchObject({ outcome: "INTERESTED" });
      expect(await prisma.reminder.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject({ answer: "INTERESTED" });
    });

    it("says when there is nothing to confirm, and when the number is unknown", async () => {
      await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });
      expect(await applyPatientAnswer(prisma, { organizationId: clinic, phoneE164: PHONE, answer: "CONFIRM" }, NOW)).toEqual({ outcome: "NO_APPOINTMENT", reply: null });
      expect(await applyPatientAnswer(prisma, { organizationId: clinic, phoneE164: "+5511900000000", answer: "OPT_OUT" }, NOW)).toEqual({ outcome: "UNKNOWN_PATIENT", reply: null });
    });
  });
});
