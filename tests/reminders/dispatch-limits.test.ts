import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DAYTIME = new Date("2026-10-15T12:00:00.000Z"); // 09:00 local
const NIGHT = new Date("2026-10-16T02:00:00.000Z"); // 23:00 local
const NEXT_MORNING = new Date("2026-10-16T11:00:00.000Z"); // 08:00 local

describe("sending window and daily limit when handing reminders to n8n", () => {
  let clinic: string;
  let dentistId: string;
  let procedureId: string;
  let slot = 0;

  beforeEach(async () => {
    slot = 0;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    dentistId = (await createDentist(prisma, clinic)).id;
    procedureId = (await createProcedure(prisma, clinic)).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function reminder(options: {
    now: Date;
    kind?: "CONFIRMATION" | "REMINDER_2H";
    status?: "PENDING" | "SENT";
    sentAt?: Date;
    org?: string;
  }) {
    const org = options.org ?? clinic;
    const dentist = org === clinic ? dentistId : (await createDentist(prisma, org)).id;
    const procedure = org === clinic ? procedureId : (await createProcedure(prisma, org)).id;
    const patient = await createPatient(prisma, org, { name: "Maria Souza" });
    // One slot per call: the same dentist cannot have overlapping appointments.
    const startsAt = new Date(options.now.getTime() + 3 * DAY + slot++ * HOUR);
    const appointment = await prisma.appointment.create({
      data: { organizationId: org, patientId: patient.id, dentistId: dentist, procedureId: procedure, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) },
    });
    return prisma.reminder.create({
      data: {
        organizationId: org,
        appointmentId: appointment.id,
        kind: options.kind ?? "CONFIRMATION",
        status: options.status ?? "PENDING",
        dueAt: new Date(options.now.getTime() - 60_000),
        sentAt: options.sentAt,
        attempts: options.status === "SENT" ? 1 : 0,
      },
    });
  }
  const settings = (data: Record<string, unknown>, org = clinic) =>
    prisma.clinicSettings.upsert({ where: { organizationId: org }, update: data, create: { organizationId: org, ...data } });
  const row = (id: string) => prisma.reminder.findUniqueOrThrow({ where: { id } });

  describe("quiet hours", () => {
    it("holds a reminder until the quiet period ends instead of waking the patient", async () => {
      const held = await reminder({ now: NIGHT });

      expect(await claimDueReminders(prisma, { now: NIGHT })).toEqual([]);

      expect(await row(held.id)).toMatchObject({ status: "PENDING", attempts: 0, dueAt: NEXT_MORNING });
    });

    it("hands it over once the morning comes", async () => {
      const held = await reminder({ now: NIGHT });
      await claimDueReminders(prisma, { now: NIGHT });

      const due = await claimDueReminders(prisma, { now: new Date(NEXT_MORNING.getTime() + 60_000) });

      expect(due.map((item) => item.id)).toEqual([held.id]);
    });

    it("uses the clinic's own quiet hours and can be switched off", async () => {
      await settings({ quietEnabled: false });
      const awake = await reminder({ now: NIGHT });

      expect((await claimDueReminders(prisma, { now: NIGHT })).map((item) => item.id)).toEqual([awake.id]);
    });

    it("does not hold anything during the day", async () => {
      const normal = await reminder({ now: DAYTIME });
      expect((await claimDueReminders(prisma, { now: DAYTIME })).map((item) => item.id)).toEqual([normal.id]);
    });

    it("takes a stale claim back to pending when the quiet period holds it", async () => {
      const stale = await reminder({ now: NIGHT });
      await prisma.reminder.update({ where: { id: stale.id }, data: { status: "CLAIMED", claimedAt: new Date(NIGHT.getTime() - HOUR), attempts: 1 } });

      await claimDueReminders(prisma, { now: NIGHT });

      expect(await row(stale.id)).toMatchObject({ status: "PENDING", claimedAt: null, dueAt: NEXT_MORNING });
    });
  });

  describe("daily limit", () => {
    it("hands over only what fits in today's limit and holds the rest until tomorrow's window", async () => {
      await settings({ dailySendLimit: 2 });
      const first = await reminder({ now: DAYTIME });
      const second = await reminder({ now: DAYTIME });
      const third = await reminder({ now: DAYTIME });

      const due = await claimDueReminders(prisma, { now: DAYTIME });

      expect(due).toHaveLength(2);
      const held = [first, second, third].filter((item) => !due.some((entry) => entry.id === item.id));
      expect(held).toHaveLength(1);
      expect(await row((held[0] as { id: string }).id)).toMatchObject({ status: "PENDING", attempts: 0, dueAt: NEXT_MORNING });
    });

    it("counts what was already sent today, but not yesterday", async () => {
      await settings({ dailySendLimit: 3 });
      await reminder({ now: DAYTIME, status: "SENT", sentAt: new Date(DAYTIME.getTime() - HOUR) });
      await reminder({ now: DAYTIME, status: "SENT", sentAt: new Date(DAYTIME.getTime() - 2 * HOUR) });
      await reminder({ now: DAYTIME, status: "SENT", sentAt: new Date(DAYTIME.getTime() - DAY) });
      await reminder({ now: DAYTIME });
      await reminder({ now: DAYTIME });

      expect(await claimDueReminders(prisma, { now: DAYTIME })).toHaveLength(1);
    });

    it("keeps each clinic's count separate", async () => {
      await settings({ dailySendLimit: 1 });
      const other = await createClinic(prisma, "b");
      await connectWhatsapp(prisma, other);
      await reminder({ now: DAYTIME });
      await reminder({ now: DAYTIME });
      const elsewhere = await reminder({ now: DAYTIME, org: other });

      const due = await claimDueReminders(prisma, { now: DAYTIME });

      expect(due.filter((item) => item.clinic.id === clinic)).toHaveLength(1);
      expect(due.some((item) => item.id === elsewhere.id)).toBe(true);
    });
  });
});
