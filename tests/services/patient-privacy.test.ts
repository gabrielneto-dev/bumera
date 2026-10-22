import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { bookAppointment } from "@/lib/services/appointments";
import { exportPatientData } from "@/lib/services/patient-privacy";
import { anonymizePatient, createPatient, listPatients, updatePatient } from "@/lib/services/patients";
import { createQuote } from "@/lib/services/quotes";
import { createClinic, createDentist, createProcedure } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const VALID_CPF = "529.982.247-25";
const TUESDAY_10H = "2026-10-20T13:00:00.000Z";

describe("patient data rights (LGPD art. 18)", () => {
  let clinicA: string;
  let clinicB: string;
  let dentistId: string;
  let procedureId: string;
  const admin = (clinic: string) => ctxFor(prisma, clinic, "admin");
  const secretary = (clinic: string) => ctxFor(prisma, clinic, "secretary");

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
    dentistId = (await createDentist(prisma, clinicA, "Dra. Ana")).id;
    procedureId = (await createProcedure(prisma, clinicA, "Limpeza")).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function patientWithHistory() {
    const patient = await createPatient(secretary(clinicA), { name: "Maria Souza", phone: "(11) 98765-4321", cpf: VALID_CPF, birthDate: "1990-05-20", consent: true });
    const appointment = await bookAppointment(secretary(clinicA), { patientId: patient.id, dentistId, procedureId, startsAt: TUESDAY_10H });
    const quote = await createQuote(secretary(clinicA), { patientId: patient.id, description: "Implante da Maria", value: 3500 });
    return { patient, appointment, quote };
  }

  describe("exporting", () => {
    it("gathers everything held about the patient, including the CPF in full", async () => {
      const { patient, appointment, quote } = await patientWithHistory();
      await prisma.reminder.updateMany({ where: { appointmentId: appointment.id, kind: "CONFIRMATION" }, data: { status: "SENT", sentAt: NOW, attempts: 1 } });

      const data = await exportPatientData(secretary(clinicA), patient.id);

      expect(data.patient).toMatchObject({
        id: patient.id,
        name: "Maria Souza",
        cpf: "52998224725",
        phone: "+5511987654321",
        birthDate: "1990-05-20",
        doNotContact: false,
      });
      expect(data.patient.consentAt).toBe(NOW.toISOString());
      expect(data.appointments).toEqual([expect.objectContaining({ id: appointment.id, status: "SCHEDULED", dentist: "Dra. Ana", procedure: "Limpeza" })]);
      expect(data.quotes).toEqual([expect.objectContaining({ id: quote.id, description: "Implante da Maria", valueReais: 3500, status: "OPEN" })]);
      expect(data.messages.find((item) => item.kind === "CONFIRMATION")).toMatchObject({ status: "SENT", sentAt: NOW.toISOString() });
      expect(typeof data.exportedAt).toBe("string");
    });

    it("exports a patient without CPF or birth date", async () => {
      const patient = await createPatient(secretary(clinicA), { name: "Joana Lima", phone: "(11) 91234-5678" });
      const data = await exportPatientData(secretary(clinicA), patient.id);
      expect(data.patient).toMatchObject({ cpf: null, birthDate: null });
      expect(data.appointments).toEqual([]);
    });

    it("never includes another patient's or another clinic's data", async () => {
      const { patient } = await patientWithHistory();
      const other = await createPatient(secretary(clinicA), { name: "Outro Paciente", phone: "(11) 90000-1111" });
      await bookAppointment(secretary(clinicA), { patientId: other.id, dentistId, procedureId, startsAt: "2026-10-20T15:00:00.000Z" });

      const data = await exportPatientData(secretary(clinicA), patient.id);

      expect(data.appointments).toHaveLength(1);
      expect(JSON.stringify(data)).not.toContain("Outro Paciente");
      await expect(exportPatientData(secretary(clinicB), patient.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("is recorded in the activity log, and refused to roles that cannot edit patients", async () => {
      const { patient } = await patientWithHistory();
      await exportPatientData(secretary(clinicA), patient.id);

      const exported = await prisma.auditLog.findMany({ where: { action: "PATIENT_EXPORTED" } });
      expect(exported).toHaveLength(1);
      expect(exported[0]).toMatchObject({ patientId: patient.id, actorUserId: "user_test" });
      await expect(exportPatientData(ctxFor(prisma, clinicA, "dentist"), patient.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("erasing (anonymizing)", () => {
    it("removes every personal field and keeps only the clinic's record of what happened", async () => {
      const { patient, appointment, quote } = await patientWithHistory();

      const result = await anonymizePatient(admin(clinicA), patient.id);

      expect(result).toMatchObject({ name: "Paciente removido", cpfMasked: null, doNotContact: true, anonymized: true });
      const row = await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } });
      expect(row).toMatchObject({
        name: "Paciente removido",
        cpfEncrypted: null,
        cpfHash: null,
        phoneE164: "REMOVIDO",
        birthDate: null,
        consentAt: null,
        consentSource: null,
        doNotContact: true,
      });
      expect(row.anonymizedAt).toEqual(NOW);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).patientId).toBe(patient.id);
      expect(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ description: "(removido)", status: "DECLINED", closedAt: NOW });
    });

    it("stops every message that was still waiting", async () => {
      const { patient } = await patientWithHistory();

      await anonymizePatient(admin(clinicA), patient.id);

      const open = await prisma.reminder.count({ where: { status: { in: ["PENDING", "CLAIMED"] } } });
      expect(open).toBe(0);
    });

    it("is recorded in the activity log without personal values", async () => {
      const { patient } = await patientWithHistory();
      await anonymizePatient(admin(clinicA), patient.id);

      const log = await prisma.auditLog.findMany({ where: { action: "PATIENT_ANONYMIZED" } });
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ patientId: patient.id, actorType: "USER" });
      expect(JSON.stringify(log)).not.toContain("Maria");
    });

    it("is safe to repeat", async () => {
      const { patient } = await patientWithHistory();
      await anonymizePatient(admin(clinicA), patient.id);
      await anonymizePatient(admin(clinicA), patient.id);

      expect(await prisma.auditLog.count({ where: { action: "PATIENT_ANONYMIZED" } })).toBe(1);
    });

    it("is limited to the administrator and to the patient's own clinic", async () => {
      const { patient } = await patientWithHistory();
      await expect(anonymizePatient(secretary(clinicA), patient.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(anonymizePatient(admin(clinicB), patient.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await prisma.patient.findUniqueOrThrow({ where: { id: patient.id } })).anonymizedAt).toBeNull();
    });

    it("leaves the patient unusable: no edits, bookings, quotes or exports", async () => {
      const { patient } = await patientWithHistory();
      await anonymizePatient(admin(clinicA), patient.id);

      await expect(updatePatient(secretary(clinicA), patient.id, { name: "De novo" })).rejects.toMatchObject({ code: "ANONYMIZED_PATIENT" });
      await expect(bookAppointment(secretary(clinicA), { patientId: patient.id, dentistId, procedureId, startsAt: "2026-10-21T13:00:00.000Z" })).rejects.toMatchObject({ code: "ANONYMIZED_PATIENT" });
      await expect(createQuote(secretary(clinicA), { patientId: patient.id, description: "Novo" })).rejects.toMatchObject({ code: "ANONYMIZED_PATIENT" });
      await expect(exportPatientData(secretary(clinicA), patient.id)).rejects.toMatchObject({ code: "ANONYMIZED_PATIENT" });
    });

    it("is shown as such in the patient list, and its old phone no longer reaches it", async () => {
      const { patient } = await patientWithHistory();
      await anonymizePatient(admin(clinicA), patient.id);

      const list = await listPatients(secretary(clinicA), {});
      expect(list.items[0]).toMatchObject({ name: "Paciente removido", anonymized: true });
      const reply = await handleInboundMessage(prisma, { instance: "x", organizationId: clinicA, phoneE164: "+5511987654321", text: "1", messageId: "m1" }, NOW);
      expect(reply).toEqual({ outcome: "UNKNOWN_PATIENT" });
    });
  });
});
