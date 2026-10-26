import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyPatientAnswer } from "@/lib/n8n-api/answers";
import { createPrismaClient } from "@/lib/prisma";
import { DEFAULT_CLINIC_SETTINGS } from "@/lib/reminders/settings";
import { listAuditLog } from "@/lib/services/audit";
import { bookAppointment, changeAppointmentStatus } from "@/lib/services/appointments";
import { allowMessagesAgain, confirmPatient, createPatient, updatePatient } from "@/lib/services/patients";
import { changeQuoteStatus, createQuote } from "@/lib/services/quotes";
import { updateSettings } from "@/lib/services/settings";
import { setWhatsappInstance } from "@/lib/services/whatsapp";
import { createClinic, createDentist, createPatient as makePatient, createProcedure } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const TUESDAY_10H = "2026-10-20T13:00:00.000Z";
const VALID_CPF = "529.982.247-25";

describe("activity log", () => {
  let clinicA: string;
  let clinicB: string;
  const admin = (clinic: string) => ctxFor(prisma, clinic, "admin");
  const secretary = (clinic: string) => ctxFor(prisma, clinic, "secretary");
  const entries = (clinic = clinicA) => prisma.auditLog.findMany({ where: { organizationId: clinic }, orderBy: { createdAt: "asc" } });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("reading it", () => {
    it("is limited to the clinic administrator", async () => {
      for (const role of ["secretary", "dentist"]) {
        await expect(listAuditLog(ctxFor(prisma, clinicA, role))).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(await listAuditLog(admin(clinicA))).toEqual([]);
    });

    it("lists this clinic's entries newest first, optionally for one patient", async () => {
      const first = await createPatient(secretary(clinicA), { name: "Maria Souza", phone: "(11) 98765-4321" });
      const second = await createPatient(secretary(clinicA), { name: "Joana Lima", phone: "(11) 91234-5678" });
      await createPatient(secretary(clinicB), { name: "Outra Clínica", phone: "(11) 90000-1111" });

      const all = await listAuditLog(admin(clinicA));
      expect(all.map((item) => item.patientId)).toEqual([second.id, first.id]);
      expect(await listAuditLog(admin(clinicA), { patientId: first.id })).toHaveLength(1);
      expect(await listAuditLog(admin(clinicA), { limit: 1 })).toHaveLength(1);
    });

    it("cannot be altered in the database", async () => {
      await createPatient(secretary(clinicA), { name: "Maria Souza", phone: "(11) 98765-4321" });
      await expect(prisma.auditLog.updateMany({ data: { action: "PATIENT_UPDATED" } })).rejects.toThrow();
    });
  });

  describe("what gets recorded", () => {
    it("records who created and changed a patient, with field names only", async () => {
      const patient = await createPatient(secretary(clinicA), { name: "Maria Souza", phone: "(11) 98765-4321", cpf: VALID_CPF });
      await updatePatient(secretary(clinicA), patient.id, { name: "Maria S. Souza", phone: "(11) 99999-8888" });
      await confirmPatient(secretary(clinicA), patient.id);

      const log = await entries();
      expect(log.map((item) => item.action)).toEqual(["PATIENT_CREATED", "PATIENT_UPDATED", "PATIENT_CONFIRMED"]);
      expect(log[0]).toMatchObject({ actorType: "USER", actorUserId: "user_test", patientId: patient.id, entityId: patient.id });
      expect(log[1]?.details).toEqual({ fields: ["name", "phone"] });
      const everything = JSON.stringify(log.map((item) => item.details));
      for (const secret of ["Maria", "98765", "99999", "529", "247"]) expect(everything).not.toContain(secret);
    });

    it("records the renewal of a consent", async () => {
      const patient = await makePatient(prisma, clinicA, { doNotContact: true });
      await allowMessagesAgain(secretary(clinicA), patient.id, { consent: true });

      expect((await entries()).map((item) => item.action)).toEqual(["CONSENT_RENEWED"]);
    });

    it("records appointments and their status changes", async () => {
      const dentist = await createDentist(prisma, clinicA);
      const procedure = await createProcedure(prisma, clinicA);
      const patient = await makePatient(prisma, clinicA);
      const appointment = await bookAppointment(secretary(clinicA), { patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt: TUESDAY_10H });
      await changeAppointmentStatus(secretary(clinicA), appointment.id, "CONFIRMED");

      const log = await entries();
      expect(log.map((item) => item.action)).toEqual(["APPOINTMENT_BOOKED", "APPOINTMENT_STATUS_CHANGED"]);
      expect(log[0]).toMatchObject({ patientId: patient.id, entityId: appointment.id });
      expect(log[1]?.details).toEqual({ from: "SCHEDULED", to: "CONFIRMED" });
    });

    it("records quotes", async () => {
      const patient = await makePatient(prisma, clinicA);
      const quote = await createQuote(secretary(clinicA), { patientId: patient.id, description: "Implante dente 36", value: 3500 });
      await changeQuoteStatus(secretary(clinicA), quote.id, "ACCEPTED");

      const log = await entries();
      expect(log.map((item) => item.action)).toEqual(["QUOTE_CREATED", "QUOTE_CLOSED"]);
      expect(log[1]?.details).toEqual({ status: "ACCEPTED" });
      expect(JSON.stringify(log)).not.toMatch(/Implante|3500/);
    });

    it("records settings changes by field name and the WhatsApp connection", async () => {
      await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, reminder1HoursBefore: 48, dailySendLimit: 100 });
      await setWhatsappInstance(admin(clinicA), { instance: "clinica-a" });
      await setWhatsappInstance(admin(clinicA), { instance: null });

      const log = await entries();
      expect(log.map((item) => item.action)).toEqual(["SETTINGS_UPDATED", "WHATSAPP_CHANGED", "WHATSAPP_CHANGED"]);
      expect(log[0]?.details).toEqual({ fields: ["reminder1HoursBefore", "dailySendLimit"] });
      expect(log.slice(1).map((item) => item.details)).toEqual([{ connected: true }, { connected: false }]);
    });

    it("saving settings that change nothing leaves no entry", async () => {
      await updateSettings(admin(clinicA), DEFAULT_CLINIC_SETTINGS);
      expect(await entries()).toEqual([]);
    });

    it("records what a patient does on WhatsApp as the system", async () => {
      const dentist = await createDentist(prisma, clinicA);
      const procedure = await createProcedure(prisma, clinicA);
      const patient = await makePatient(prisma, clinicA, { phoneE164: "+5511987654321" });
      const starts = new Date(NOW.getTime() + 24 * 3_600_000);
      await prisma.appointment.create({
        data: { organizationId: clinicA, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt: starts, endsAt: new Date(starts.getTime() + 1_800_000) },
      });
      const answer = (value: "CONFIRM" | "OPT_OUT") => applyPatientAnswer(prisma, { organizationId: clinicA, phoneE164: "+5511987654321", answer: value }, NOW);

      await answer("CONFIRM");
      await answer("OPT_OUT");

      const log = await entries();
      expect(log.map((item) => [item.action, item.actorType, item.actorUserId])).toEqual([
        ["APPOINTMENT_ANSWERED_BY_PATIENT", "SYSTEM", null],
        ["PATIENT_OPTED_OUT", "SYSTEM", null],
      ]);
      expect(log[0]?.details).toEqual({ answer: "CONFIRMED" });
      expect(log.every((item) => item.patientId === patient.id)).toBe(true);
    });
  });
});
