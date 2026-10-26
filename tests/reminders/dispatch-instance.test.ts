import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;

describe("whatsapp instance when handing reminders to n8n", () => {
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

  async function reminder(clinic: string, kind: "CONFIRMATION" = "CONFIRMATION") {
    const dentist = await createDentist(prisma, clinic);
    const procedure = await createProcedure(prisma, clinic);
    const patient = await createPatient(prisma, clinic, { name: "Maria Souza" });
    const startsAt = new Date(NOW.getTime() + 3 * DAY);
    const appointment = await prisma.appointment.create({
      data: { organizationId: clinic, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * MINUTE) },
    });
    return prisma.reminder.create({ data: { organizationId: clinic, appointmentId: appointment.id, kind, dueAt: new Date(NOW.getTime() - MINUTE) } });
  }
  const connect = (clinic: string, instance: string) => prisma.clinicSettings.create({ data: { organizationId: clinic, whatsappInstance: instance } });

  it("tells n8n which instance each message goes out through", async () => {
    await connect(clinicA, "clinica-a");
    await connect(clinicB, "clinica-b");
    const first = await reminder(clinicA);
    const second = await reminder(clinicB);

    const due = await claimDueReminders(prisma, { now: NOW });

    const byId = new Map(due.map((item) => [item.id, item.whatsapp.instance]));
    expect(byId.get(first.id)).toBe("clinica-a");
    expect(byId.get(second.id)).toBe("clinica-b");
  });

  it("holds the messages of a clinic without a connected WhatsApp instead of sending them anywhere", async () => {
    const waiting = await reminder(clinicA);

    expect(await claimDueReminders(prisma, { now: NOW })).toEqual([]);

    const row = await prisma.reminder.findUniqueOrThrow({ where: { id: waiting.id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(row.dueAt).toEqual(new Date(NOW.getTime() + 30 * MINUTE));
  });

  it("delivers a held message once the clinic connects", async () => {
    const waiting = await reminder(clinicA);
    await claimDueReminders(prisma, { now: NOW });
    await connect(clinicA, "clinica-a");

    const due = await claimDueReminders(prisma, { now: new Date(NOW.getTime() + 31 * MINUTE) });

    expect(due.map((item) => item.id)).toEqual([waiting.id]);
  });

  it("does not let a clinic without WhatsApp block another clinic's messages", async () => {
    await connect(clinicB, "clinica-b");
    await reminder(clinicA);
    const ready = await reminder(clinicB);

    const due = await claimDueReminders(prisma, { now: NOW });

    expect(due.map((item) => item.id)).toEqual([ready.id]);
  });
});
