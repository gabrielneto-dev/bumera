import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { listFailedReminders } from "@/lib/services/reminders";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;

describe("listFailedReminders", () => {
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

  async function failed(clinic: string, startsInHours: number, status: "FAILED" | "SENT" = "FAILED", name = "Maria") {
    const dentist = await createDentist(prisma, clinic);
    const procedure = await createProcedure(prisma, clinic);
    const patient = await createPatient(prisma, clinic, { name });
    const startsAt = new Date(NOW.getTime() + startsInHours * HOUR);
    const appointment = await prisma.appointment.create({
      data: { organizationId: clinic, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000) },
    });
    return prisma.reminder.create({
      data: { organizationId: clinic, appointmentId: appointment.id, kind: "REMINDER_24H", dueAt: NOW, status, attempts: 5, note: "whatsapp offline" },
    });
  }

  it("lists failed reminders of upcoming and just-passed appointments with who and why", async () => {
    await failed(clinicA, 5);
    const [item] = await listFailedReminders(ctxFor(prisma, clinicA));
    expect(item).toMatchObject({ kind: "REMINDER_24H", note: "whatsapp offline", patient: { name: "Maria" } });
  });

  it("ignores delivered reminders and failures about appointments long gone", async () => {
    await failed(clinicA, 5, "SENT");
    await failed(clinicA, -48);
    expect(await listFailedReminders(ctxFor(prisma, clinicA))).toEqual([]);
  });

  it("never shows another clinic's failures", async () => {
    await failed(clinicB, 5, "FAILED", "Outra");
    expect(await listFailedReminders(ctxFor(prisma, clinicA))).toEqual([]);
  });

  it("is only for people who manage appointments", async () => {
    await expect(listFailedReminders(ctxFor(prisma, clinicA, "dentist"))).resolves.toEqual([]);
    await expect(listFailedReminders(ctxFor(prisma, clinicA, "nobody"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
