import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_ATTEMPTS } from "@/lib/reminders/guard";
import { claimDueReminders, recordReminderResult } from "@/lib/reminders/dispatch";
import { createPrismaClient } from "@/lib/prisma";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const MINUTE = 60_000;
const HOUR = 3_600_000;
const STARTS = new Date(NOW.getTime() + 48 * HOUR);

describe("reminder dispatch", () => {
  let clinic: string;
  let dentistId: string;
  let procedureId: string;
  let patientId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    dentistId = (await createDentist(prisma, clinic, "Dra. Ana Paula")).id;
    procedureId = (await createProcedure(prisma, clinic, "Limpeza")).id;
    patientId = (await createPatient(prisma, clinic, { name: "Maria da Silva", phoneE164: "+5511987654321" })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seed(options: {
    status?: "SCHEDULED" | "CONFIRMED" | "CANCELLED" | "NO_SHOW";
    startsAt?: Date;
    dueAt?: Date;
    kind?: "CONFIRMATION" | "REMINDER_24H" | "REMINDER_2H" | "NO_SHOW_FOLLOWUP";
    patient?: string;
    reminderStatus?: "PENDING" | "CLAIMED";
    claimedAt?: Date;
    attempts?: number;
  } = {}) {
    const startsAt = options.startsAt ?? STARTS;
    const appointment = await prisma.appointment.create({
      data: {
        organizationId: clinic,
        patientId: options.patient ?? patientId,
        dentistId,
        procedureId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * MINUTE),
        status: options.status ?? "SCHEDULED",
      },
    });
    return prisma.reminder.create({
      data: {
        organizationId: clinic,
        appointmentId: appointment.id,
        kind: options.kind ?? "REMINDER_24H",
        dueAt: options.dueAt ?? new Date(NOW.getTime() - MINUTE),
        status: options.reminderStatus ?? "PENDING",
        claimedAt: options.claimedAt,
        attempts: options.attempts ?? 0,
      },
    });
  }

  const statusOf = async (id: string) => (await prisma.reminder.findUniqueOrThrow({ where: { id } })).status;

  describe("claimDueReminders", () => {
    it("hands out a due reminder with the message and what n8n needs to send it", async () => {
      const reminder = await seed();
      const [due, ...rest] = await claimDueReminders(prisma, { now: NOW });
      expect(rest).toEqual([]);
      expect(due).toMatchObject({
        id: reminder.id,
        kind: "REMINDER_24H",
        attempt: 1,
        clinic: { id: clinic, name: "Clinic a" },
        patient: { firstName: "Maria", phone: "+5511987654321" },
        appointment: { dentistName: "Dra. Ana Paula", procedureName: "Limpeza" },
      });
      expect(due?.message).toContain("Olá, Maria!");
      expect(JSON.stringify(due)).not.toMatch(/cpf/i);
      const stored = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
      expect(stored).toMatchObject({ status: "CLAIMED", attempts: 1, claimedAt: NOW });
    });

    it("does not hand out the same reminder twice", async () => {
      await seed();
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(1);
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
    });

    it("leaves reminders that are not due yet", async () => {
      const reminder = await seed({ dueAt: new Date(NOW.getTime() + HOUR) });
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
      expect(await statusOf(reminder.id)).toBe("PENDING");
    });

    it("never sends a stale reminder: a cancelled appointment cancels it", async () => {
      const reminder = await seed({ status: "CANCELLED" });
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
      expect(await statusOf(reminder.id)).toBe("CANCELLED");
    });

    it("never sends a reminder for an appointment that already started", async () => {
      const reminder = await seed({ startsAt: new Date(NOW.getTime() - HOUR) });
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
      expect(await statusOf(reminder.id)).toBe("CANCELLED");
    });

    it("skips patients who opted out or never consented", async () => {
      const optedOut = await createPatient(prisma, clinic, { name: "Sai", doNotContact: true });
      const noConsent = await createPatient(prisma, clinic, { name: "Sem", consentAt: null });
      const a = await seed({ patient: optedOut.id, startsAt: new Date(STARTS.getTime() + HOUR) });
      const b = await seed({ patient: noConsent.id, startsAt: new Date(STARTS.getTime() + 2 * HOUR) });
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
      expect(await statusOf(a.id)).toBe("SKIPPED");
      expect(await statusOf(b.id)).toBe("SKIPPED");
    });

    it("hands the no-show follow-up even though the appointment is in the past", async () => {
      await seed({ status: "NO_SHOW", kind: "NO_SHOW_FOLLOWUP", startsAt: new Date(NOW.getTime() - 3 * HOUR) });
      const [due] = await claimDueReminders(prisma, { now: NOW });
      expect(due?.kind).toBe("NO_SHOW_FOLLOWUP");
    });

    it("hands the reminder out again when n8n never reported back", async () => {
      const reminder = await seed({ reminderStatus: "CLAIMED", claimedAt: new Date(NOW.getTime() - 20 * MINUTE), attempts: 1 });
      const [due] = await claimDueReminders(prisma, { now: NOW });
      expect(due?.id).toBe(reminder.id);
      expect(due?.attempt).toBe(2);
    });

    it("stops re-sending after the last attempt and marks the reminder failed", async () => {
      const reminder = await seed({ reminderStatus: "CLAIMED", claimedAt: new Date(NOW.getTime() - 20 * MINUTE), attempts: MAX_ATTEMPTS });
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
      expect(await statusOf(reminder.id)).toBe("FAILED");
    });

    it("drops a no-show follow-up that waited more than a day", async () => {
      const reminder = await seed({ status: "NO_SHOW", kind: "NO_SHOW_FOLLOWUP", startsAt: new Date(NOW.getTime() - 30 * HOUR) });
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
      expect(await statusOf(reminder.id)).toBe("CANCELLED");
    });

    it("skips patients whose registration is still pending", async () => {
      const pending = await prisma.patient.create({
        data: { organizationId: clinic, name: "Pendente", phoneE164: "+5511911112222", status: "PENDING", consentAt: NOW },
      });
      const reminder = await seed({ patient: pending.id });
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
      expect(await statusOf(reminder.id)).toBe("SKIPPED");
    });

    it("strips links and formatting that a patient name could smuggle into the message", async () => {
      const sneaky = await createPatient(prisma, clinic, { name: "*Dr.* http://evil.example/x Joana" });
      await seed({ patient: sneaky.id });
      const [due] = await claimDueReminders(prisma, { now: NOW });
      expect(due?.message).not.toMatch(/evil|http|\*/);
      expect(due?.patient.firstName).toBe("Joana");
    });

    it("keeps a recent claim to itself", async () => {
      await seed({ reminderStatus: "CLAIMED", claimedAt: new Date(NOW.getTime() - MINUTE), attempts: 1 });
      expect(await claimDueReminders(prisma, { now: NOW })).toHaveLength(0);
    });

    it("respects the limit and serves the oldest first", async () => {
      const late = await seed({ dueAt: new Date(NOW.getTime() - MINUTE), startsAt: new Date(STARTS.getTime() + HOUR) });
      const early = await seed({ dueAt: new Date(NOW.getTime() - HOUR), startsAt: new Date(STARTS.getTime() + 2 * HOUR) });
      const [first] = await claimDueReminders(prisma, { now: NOW, limit: 1 });
      expect(first?.id).toBe(early.id);
      expect(await statusOf(late.id)).toBe("PENDING");
    });

    it("gives concurrent pollers disjoint reminders", async () => {
      for (let i = 0; i < 6; i += 1) await seed({ startsAt: new Date(STARTS.getTime() + i * HOUR) });
      const [a, b] = await Promise.all([
        claimDueReminders(prisma, { now: NOW, limit: 4 }),
        claimDueReminders(prisma, { now: NOW, limit: 4 }),
      ]);
      const ids = [...a, ...b].map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(6);
    });

    it("serves every clinic in one poll, each reminder tagged with its clinic", async () => {
      await seed();
      const other = await createClinic(prisma, "b");
      const d = await createDentist(prisma, other);
      const p = await createProcedure(prisma, other);
      const pt = await createPatient(prisma, other, { name: "Outra" });
      const appointment = await prisma.appointment.create({
        data: { organizationId: other, patientId: pt.id, dentistId: d.id, procedureId: p.id, startsAt: STARTS, endsAt: new Date(STARTS.getTime() + 30 * MINUTE) },
      });
      await prisma.reminder.create({ data: { organizationId: other, appointmentId: appointment.id, kind: "REMINDER_2H", dueAt: new Date(NOW.getTime() - MINUTE) } });
      const due = await claimDueReminders(prisma, { now: NOW });
      expect(due.map((r) => r.clinic.id).sort()).toEqual([clinic, other].sort());
    });
  });

  describe("recordReminderResult", () => {
    const claimed = async (attempts = 1) => seed({ reminderStatus: "CLAIMED", claimedAt: NOW, attempts });

    it("marks a delivered reminder as sent", async () => {
      const reminder = await claimed();
      const result = await recordReminderResult(prisma, reminder.id, { outcome: "sent", attempt: 1 }, NOW);
      expect(result.status).toBe("SENT");
      expect(await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).toMatchObject({ status: "SENT", sentAt: NOW });
    });

    it("answers a repeated report without changing anything", async () => {
      const reminder = await claimed();
      await recordReminderResult(prisma, reminder.id, { outcome: "sent", attempt: 1 }, NOW);
      const again = await recordReminderResult(prisma, reminder.id, { outcome: "failed", error: "late", attempt: 1 }, new Date(NOW.getTime() + HOUR));
      expect(again.status).toBe("SENT");
    });

    it("ignores a result for a reminder that was cancelled meanwhile", async () => {
      const reminder = await claimed();
      await prisma.reminder.update({ where: { id: reminder.id }, data: { status: "CANCELLED" } });
      const result = await recordReminderResult(prisma, reminder.id, { outcome: "sent", attempt: 1 }, NOW);
      expect(result.status).toBe("CANCELLED");
    });

    it("schedules a retry with a growing delay after a failure", async () => {
      const reminder = await claimed(1);
      const result = await recordReminderResult(prisma, reminder.id, { outcome: "failed", error: "whatsapp offline", attempt: 1 }, NOW);
      expect(result.status).toBe("PENDING");
      const stored = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
      expect(stored.dueAt).toEqual(new Date(NOW.getTime() + MINUTE));
      expect(stored.note).toBe("whatsapp offline");
    });

    it("gives up after the last attempt so the secretary can be alerted", async () => {
      const reminder = await claimed(MAX_ATTEMPTS);
      const result = await recordReminderResult(prisma, reminder.id, { outcome: "failed", error: "still offline", attempt: MAX_ATTEMPTS }, NOW);
      expect(result.status).toBe("FAILED");
    });

    it("does not retry past the start of the appointment", async () => {
      const soon = new Date(NOW.getTime() + 30 * 1000);
      const reminder = await seed({ reminderStatus: "CLAIMED", claimedAt: NOW, attempts: 1, startsAt: soon, kind: "CONFIRMATION" });
      const result = await recordReminderResult(prisma, reminder.id, { outcome: "failed", attempt: 1 }, NOW);
      expect(result.status).toBe("FAILED");
    });

    it("ignores a report about an older attempt than the one currently claimed", async () => {
      const reminder = await claimed(2); // attempt 2 is in flight; attempt 1 reports late
      const stale = await recordReminderResult(prisma, reminder.id, { outcome: "sent", attempt: 1 }, NOW);
      expect(stale.status).toBe("CLAIMED");
      expect(await statusOf(reminder.id)).toBe("CLAIMED");
      const current = await recordReminderResult(prisma, reminder.id, { outcome: "sent", attempt: 2 }, NOW);
      expect(current.status).toBe("SENT");
    });

    it("rejects an unknown reminder", async () => {
      await expect(recordReminderResult(prisma, "does-not-exist", { outcome: "sent", attempt: 1 }, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("truncates a very long error note", async () => {
      const reminder = await claimed();
      await recordReminderResult(prisma, reminder.id, { outcome: "failed", error: "x".repeat(2000), attempt: 1 }, NOW);
      const stored = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
      expect((stored.note ?? "").length).toBeLessThanOrEqual(500);
    });
  });
});
