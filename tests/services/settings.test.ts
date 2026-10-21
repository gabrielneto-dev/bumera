import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import { DEFAULT_CLINIC_SETTINGS } from "@/lib/reminders/settings";
import { bookAppointment } from "@/lib/services/appointments";
import { createQuote } from "@/lib/services/quotes";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TUESDAY_10H = "2026-10-20T13:00:00.000Z"; // 10:00 in Sao Paulo, 5 days after NOW

describe("clinic settings", () => {
  let clinicA: string;
  let clinicB: string;
  const admin = (clinic: string) => ctxFor(prisma, clinic, "admin");

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function bookFuture(clinic = clinicA) {
    const dentist = await createDentist(prisma, clinic);
    const procedure = await createProcedure(prisma, clinic);
    const patient = await createPatient(prisma, clinic);
    return bookAppointment(ctxFor(prisma, clinic), { patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt: TUESDAY_10H });
  }
  const remindersOf = (appointmentId: string) =>
    prisma.reminder.findMany({ where: { appointmentId }, orderBy: { dueAt: "asc" } });

  it("returns the defaults until the clinic saves something", async () => {
    expect(await getSettings(admin(clinicA))).toEqual(DEFAULT_CLINIC_SETTINGS);
  });

  it("saves and returns the clinic's settings, separately per clinic", async () => {
    const saved = await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, reminder1HoursBefore: 48, quoteValidDays: 20 });

    expect(saved).toMatchObject({ reminder1HoursBefore: 48, quoteValidDays: 20 });
    expect(await getSettings(admin(clinicA))).toEqual(saved);
    expect(await getSettings(admin(clinicB))).toEqual(DEFAULT_CLINIC_SETTINGS);
  });

  it.each([
    [{ reminder1HoursBefore: 0 }],
    [{ reminder1HoursBefore: 200 }],
    [{ reminder2HoursBefore: 1.5 }],
    [{ noShowDelayHours: 100 }],
    [{ quoteFollowup1Days: 0 }],
    [{ reminder1HoursBefore: 2, reminder2HoursBefore: 4 }],
    [{ quoteFollowup1Days: 8, quoteFollowup2Days: 3 }],
    [{ quoteFollowup2Days: 20, quoteValidDays: 10 }],
    [{ confirmationEnabled: "yes" }],
  ])("rejects invalid settings %j", async (override) => {
    await expect(updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, ...override })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await getSettings(admin(clinicA))).toEqual(DEFAULT_CLINIC_SETTINGS);
  });

  it("does not compare the two reminders when one of them is switched off", async () => {
    const saved = await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, reminder1Enabled: false, reminder1HoursBefore: 1 });
    expect(saved.reminder1Enabled).toBe(false);
  });

  it("is limited to the clinic administrator", async () => {
    for (const role of ["secretary", "dentist"]) {
      await expect(getSettings(ctxFor(prisma, clinicA, role))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(updateSettings(ctxFor(prisma, clinicA, role), DEFAULT_CLINIC_SETTINGS)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("applies the settings when an appointment is booked", async () => {
    await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, confirmationEnabled: false, reminder2HoursBefore: 4 });

    const appointment = await bookFuture();

    const reminders = await remindersOf(appointment.id);
    expect(reminders.map((item) => item.kind)).toEqual(["REMINDER_24H", "REMINDER_2H"]);
    expect(reminders[1]?.dueAt.toISOString()).toBe(new Date(new Date(TUESDAY_10H).getTime() - 4 * HOUR).toISOString());
  });

  it("re-plans the unsent reminders of upcoming appointments when the settings change", async () => {
    const appointment = await bookFuture();
    const starts = new Date(TUESDAY_10H).getTime();

    await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, reminder1HoursBefore: 48, reminder2Enabled: false });

    const reminders = await remindersOf(appointment.id);
    const byKind = new Map(reminders.map((item) => [item.kind, item]));
    expect(byKind.get("REMINDER_24H")?.dueAt.getTime()).toBe(starts - 48 * HOUR);
    expect(byKind.get("REMINDER_2H")?.status).toBe("CANCELLED");
    expect(byKind.get("CONFIRMATION")?.status).toBe("PENDING");
  });

  it("never rewrites a reminder that was already sent", async () => {
    const appointment = await bookFuture();
    await prisma.reminder.updateMany({ where: { appointmentId: appointment.id, kind: "CONFIRMATION" }, data: { status: "SENT", sentAt: NOW, attempts: 1 } });

    await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, confirmationEnabled: false });

    const sent = await prisma.reminder.findFirstOrThrow({ where: { appointmentId: appointment.id, kind: "CONFIRMATION" } });
    expect(sent.status).toBe("SENT");
  });

  it("leaves another clinic's reminders alone", async () => {
    const other = await bookFuture(clinicB);

    await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, reminder2Enabled: false });

    expect((await remindersOf(other.id)).every((item) => item.status === "PENDING")).toBe(true);
  });

  it("applies the follow-up days to new quotes and re-plans open ones", async () => {
    const patient = await createPatient(prisma, clinicA);
    const quote = await createQuote(ctxFor(prisma, clinicA), { patientId: patient.id, description: "Implante" });

    await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, quoteFollowup1Days: 3, quoteFollowup2Days: 9, quoteValidDays: 30 });

    const reminders = await prisma.reminder.findMany({ where: { quoteId: quote.id }, orderBy: { dueAt: "asc" } });
    expect(reminders.map((item) => [item.kind, item.status, item.dueAt.getTime() - NOW.getTime()])).toEqual([
      ["QUOTE_FOLLOWUP_1", "PENDING", 3 * DAY],
      ["QUOTE_FOLLOWUP_2", "PENDING", 9 * DAY],
    ]);
    const fresh = await createQuote(ctxFor(prisma, clinicA), { patientId: patient.id, description: "Outro" });
    const freshReminders = await prisma.reminder.findMany({ where: { quoteId: fresh.id }, orderBy: { dueAt: "asc" } });
    expect(freshReminders[0]?.dueAt.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });

  it("shows an old open quote as expired according to the clinic's validity", async () => {
    await updateSettings(admin(clinicA), { ...DEFAULT_CLINIC_SETTINGS, quoteValidDays: 5, quoteFollowup2Days: 4 });
    const patient = await createPatient(prisma, clinicA);
    await prisma.quote.create({ data: { organizationId: clinicA, patientId: patient.id, description: "Antigo", createdAt: new Date(NOW.getTime() - 6 * DAY) } });
    const { listQuotes } = await import("@/lib/services/quotes");

    expect((await listQuotes(ctxFor(prisma, clinicA)))[0]?.effectiveStatus).toBe("EXPIRED");
  });
});
