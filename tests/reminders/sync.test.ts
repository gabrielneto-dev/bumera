import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AppointmentStatus } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";
import { bookAppointment, changeAppointmentStatus } from "@/lib/services/appointments";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const FAR = "2026-10-20T13:00:00.000Z"; // Tuesday 10:00 local, 5 days after NOW
const HOUR = 3_600_000;

describe("reminders follow appointment changes", () => {
  let clinic: string;
  let dentistId: string;
  let procedureId: string;
  let patientId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    dentistId = (await createDentist(prisma, clinic)).id;
    procedureId = (await createProcedure(prisma, clinic)).id;
    patientId = (await createPatient(prisma, clinic)).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const ctx = () => ctxFor(prisma, clinic);
  const book = (startsAt = FAR) => bookAppointment(ctx(), { patientId, dentistId, procedureId, startsAt });
  const remindersOf = (appointmentId: string) =>
    prisma.reminder.findMany({ where: { appointmentId }, orderBy: { dueAt: "asc" } });
  const kinds = async (appointmentId: string) => (await remindersOf(appointmentId)).map((r) => `${r.kind}:${r.status}`);

  it("creates the confirmation and both reminders when an appointment is booked", async () => {
    const appointment = await book();
    const rows = await remindersOf(appointment.id);
    expect(rows.map((r) => r.kind)).toEqual(["CONFIRMATION", "REMINDER_24H", "REMINDER_2H"]);
    expect(rows[0]?.dueAt).toEqual(NOW);
    expect(rows[1]?.dueAt).toEqual(new Date(new Date(FAR).getTime() - 24 * HOUR));
    expect(rows[2]?.dueAt).toEqual(new Date(new Date(FAR).getTime() - 2 * HOUR));
    expect(rows.every((r) => r.organizationId === clinic && r.status === "PENDING")).toBe(true);
  });

  it("keeps only the 2h reminder after the patient confirms", async () => {
    const appointment = await book();
    await changeAppointmentStatus(ctx(), appointment.id, "CONFIRMED");
    expect(await kinds(appointment.id)).toEqual(
      expect.arrayContaining(["CONFIRMATION:CANCELLED", "REMINDER_24H:CANCELLED", "REMINDER_2H:PENDING"]),
    );
  });

  it("cancels every unsent reminder when the appointment is cancelled", async () => {
    const appointment = await book();
    await changeAppointmentStatus(ctx(), appointment.id, "CANCELLED");
    const rows = await remindersOf(appointment.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "CANCELLED")).toBe(true);
  });

  it("never rewrites a reminder that was already sent", async () => {
    const appointment = await book();
    await prisma.reminder.updateMany({ where: { appointmentId: appointment.id, kind: "CONFIRMATION" }, data: { status: "SENT", sentAt: NOW } });
    await changeAppointmentStatus(ctx(), appointment.id, "CANCELLED");
    expect(await kinds(appointment.id)).toEqual(expect.arrayContaining(["CONFIRMATION:SENT", "REMINDER_24H:CANCELLED"]));
  });

  it("schedules a follow-up when the patient does not show up", async () => {
    const appointment = await book();
    await changeAppointmentStatus(ctx(), appointment.id, "NO_SHOW");
    const followUp = (await remindersOf(appointment.id)).find((r) => r.kind === "NO_SHOW_FOLLOWUP");
    expect(followUp?.status).toBe("PENDING");
  });

  it("creates reminders when a pending (WhatsApp) appointment is approved", async () => {
    const created = await prisma.appointment.create({
      data: {
        organizationId: clinic,
        patientId,
        dentistId,
        procedureId,
        startsAt: new Date(FAR),
        endsAt: new Date(new Date(FAR).getTime() + 30 * 60_000),
        status: "PENDING" satisfies AppointmentStatus,
        source: "WHATSAPP",
      },
    });
    expect(await remindersOf(created.id)).toEqual([]);
    await changeAppointmentStatus(ctx(), created.id, "SCHEDULED");
    expect((await remindersOf(created.id)).map((r) => r.kind)).toContain("CONFIRMATION");
  });

  it("does not duplicate or postpone reminders when synced twice", async () => {
    const appointment = await book();
    const before = await remindersOf(appointment.id);
    await changeAppointmentStatus(ctx(), appointment.id, "SCHEDULED").catch(() => undefined); // invalid transition, nothing changes
    const after = await remindersOf(appointment.id);
    expect(after.map((r) => [r.id, r.dueAt.getTime()])).toEqual(before.map((r) => [r.id, r.dueAt.getTime()]));
  });

  it("survives two simultaneous status changes on the same appointment", async () => {
    const appointment = await book();
    const results = await Promise.allSettled([
      changeAppointmentStatus(ctx(), appointment.id, "CONFIRMED"),
      changeAppointmentStatus(ctx(), appointment.id, "CONFIRMED"),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const rows = await remindersOf(appointment.id);
    expect(rows).toHaveLength(3); // no duplicates, no crash
    expect(rows.find((r) => r.kind === "REMINDER_2H")?.status).toBe("PENDING");
  });

  it("rolls the appointment back if its reminders cannot be written", async () => {
    await expect(
      bookAppointment(ctx(), { patientId, dentistId, procedureId, startsAt: "2026-10-20T13:00:00.000Z" }),
    ).resolves.toBeDefined();
    // Same slot again: the overlap error must leave no orphan reminders behind.
    await expect(
      bookAppointment(ctx(), { patientId, dentistId, procedureId, startsAt: "2026-10-20T13:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    expect(await prisma.reminder.count()).toBe(3);
  });
});

describe("reminder tenant isolation", () => {
  it("keeps one clinic from reading, changing or creating another clinic's reminders", async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    const a = await createClinic(prisma, "a");
    const b = await createClinic(prisma, "b");
    const dentist = await createDentist(prisma, a);
    const procedure = await createProcedure(prisma, a);
    const patient = await createPatient(prisma, a);
    const appointment = await bookAppointment(ctxFor(prisma, a), {
      patientId: patient.id,
      dentistId: dentist.id,
      procedureId: procedure.id,
      startsAt: FAR,
    });
    const reminder = await prisma.reminder.findFirstOrThrow({ where: { appointmentId: appointment.id } });

    const other = ctxFor(prisma, b).db;
    expect(await other.reminder.findMany()).toEqual([]);
    expect(await other.reminder.findUnique({ where: { id: reminder.id } })).toBeNull();
    await expect(other.reminder.update({ where: { id: reminder.id }, data: { status: "SENT" } })).rejects.toBeDefined();
    await expect(
      other.reminder.create({ data: { organizationId: b, appointmentId: appointment.id, kind: "REMINDER_2H", dueAt: NOW } }),
    ).rejects.toBeDefined(); // composite FK: the appointment belongs to clinic A
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("PENDING");
  });
});
