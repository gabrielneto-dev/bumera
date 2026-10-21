import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { bookAppointment, changeAppointmentStatus } from "@/lib/services/appointments";
import { createProcedure as createProcedureService, updateProcedure } from "@/lib/services/procedures";
import { listInterestedPatients, markInterestHandled } from "@/lib/services/reminders";
import { createClinic, createDentist, createPatient } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const FRIDAY_10H = "2026-10-16T13:00:00.000Z"; // 10:00 in Sao Paulo

describe("reactivation campaign", () => {
  let clinicA: string;
  let clinicB: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const admin = (clinic: string) => ctxFor(prisma, clinic, "admin");

  it("stores the reactivation period on the procedure and validates it", async () => {
    const ctx = admin(clinicA);
    const created = await createProcedureService(ctx, { name: "Limpeza", defaultDurationMin: 30, reactivateAfterMonths: 6 });
    expect(created.reactivateAfterMonths).toBe(6);

    expect((await updateProcedure(ctx, created.id, { reactivateAfterMonths: null })).reactivateAfterMonths).toBeNull();
    await expect(updateProcedure(ctx, created.id, { reactivateAfterMonths: 0 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateProcedure(ctx, created.id, { reactivateAfterMonths: 61 })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("schedules the reactivation when an appointment is completed and the procedure has a period", async () => {
    const ctx = ctxFor(prisma, clinicA);
    const dentist = await createDentist(prisma, clinicA);
    const patient = await createPatient(prisma, clinicA);
    const procedure = await createProcedureService(admin(clinicA), { name: "Limpeza", defaultDurationMin: 30, reactivateAfterMonths: 6 });
    const appointment = await bookAppointment(ctx, { patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt: FRIDAY_10H });

    await changeAppointmentStatus(ctx, appointment.id, "COMPLETED");

    const reminder = await prisma.reminder.findFirstOrThrow({ where: { appointmentId: appointment.id, kind: "REACTIVATION" } });
    expect(reminder.status).toBe("PENDING");
    expect(reminder.dueAt.toISOString()).toBe("2027-04-16T13:30:00.000Z");
  });

  it("schedules nothing for a procedure without a period", async () => {
    const ctx = ctxFor(prisma, clinicA);
    const dentist = await createDentist(prisma, clinicA);
    const patient = await createPatient(prisma, clinicA);
    const procedure = await createProcedureService(admin(clinicA), { name: "Avaliação", defaultDurationMin: 30 });
    const appointment = await bookAppointment(ctx, { patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt: FRIDAY_10H });

    await changeAppointmentStatus(ctx, appointment.id, "COMPLETED");

    expect(await prisma.reminder.count({ where: { kind: "REACTIVATION" } })).toBe(0);
  });

  describe("patients who answered they want to come back", () => {
    async function interested(clinic: string, name: string, extra: { handled?: boolean; answer?: "INTERESTED" | "DECLINED" } = {}) {
      const dentist = await createDentist(prisma, clinic);
      const patient = await createPatient(prisma, clinic, { name });
      const procedure = await prisma.procedure.create({ data: { organizationId: clinic, name: "Limpeza" } });
      const startsAt = new Date(NOW.getTime() - 100 * 86_400_000);
      const appointment = await prisma.appointment.create({
        data: { organizationId: clinic, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status: "COMPLETED" },
      });
      return prisma.reminder.create({
        data: {
          organizationId: clinic,
          appointmentId: appointment.id,
          kind: "REACTIVATION",
          status: "SENT",
          dueAt: NOW,
          sentAt: NOW,
          answer: extra.answer ?? "INTERESTED",
          answeredAt: NOW,
          handledAt: extra.handled ? NOW : null,
        },
      });
    }

    it("lists interested patients not yet handled, for this clinic only", async () => {
      await interested(clinicA, "Maria");
      await interested(clinicA, "Joana", { handled: true });
      await interested(clinicA, "Ana", { answer: "DECLINED" });
      await interested(clinicB, "Outra clínica");

      const list = await listInterestedPatients(ctxFor(prisma, clinicA));

      expect(list.map((item) => item.patient.name)).toEqual(["Maria"]);
      expect(list[0]).toMatchObject({ kind: "REACTIVATION", patient: { phoneE164: "+5511987654321" } });
    });

    it("marks an answer as handled and refuses another clinic's", async () => {
      const reminder = await interested(clinicA, "Maria");

      await expect(markInterestHandled(ctxFor(prisma, clinicB), reminder.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await markInterestHandled(ctxFor(prisma, clinicA), reminder.id);

      expect(await listInterestedPatients(ctxFor(prisma, clinicA))).toEqual([]);
    });
  });
});
