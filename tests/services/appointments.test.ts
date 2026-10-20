import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/prisma";
import {
  bookAppointment,
  changeAppointmentStatus,
  freeSlots,
  listDay,
  listPending,
} from "@/lib/services/appointments";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { ctxFor } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const TUESDAY_10H = "2026-10-20T13:00:00.000Z"; // 10:00 in Sao Paulo (UTC-3)

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("appointments service", () => {
  let clinicA: string;
  let clinicB: string;
  let dentistId: string;
  let procedureId: string;
  let patientId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinicA = await createClinic(prisma, "a");
    clinicB = await createClinic(prisma, "b");
    dentistId = (await createDentist(prisma, clinicA)).id;
    procedureId = (await createProcedure(prisma, clinicA)).id; // 30 min
    patientId = (await createPatient(prisma, clinicA)).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const book = (overrides: Record<string, unknown> = {}, role = "secretary") =>
    bookAppointment(ctxFor(prisma, clinicA, role), {
      patientId,
      dentistId,
      procedureId,
      startsAt: TUESDAY_10H,
      ...overrides,
    });

  it("books an appointment using the procedure's duration", async () => {
    const appointment = await book();
    expect(appointment).toMatchObject({
      startsAt: TUESDAY_10H,
      endsAt: "2026-10-20T13:30:00.000Z",
      status: "SCHEDULED",
      source: "SECRETARY",
    });
    expect(appointment.patient.name).toBe("Paciente Teste");
    expect(appointment.dentist.name).toBe("Dra. Ana");
  });

  it("accepts a custom duration", async () => {
    const appointment = await book({ durationMin: 90 });
    expect(appointment.endsAt).toBe("2026-10-20T14:30:00.000Z");
  });

  it("refuses an overlapping booking with SLOT_TAKEN and frees the slot after cancelling", async () => {
    const first = await book();
    await expectCode(book({ startsAt: "2026-10-20T13:15:00.000Z" }), "SLOT_TAKEN");
    await changeAppointmentStatus(ctxFor(prisma, clinicA), first.id, "CANCELLED");
    await expect(book({ startsAt: "2026-10-20T13:15:00.000Z" })).resolves.toBeDefined();
  });

  it("refuses bookings outside working hours, on closed days and in the past", async () => {
    await expectCode(book({ startsAt: "2026-10-20T10:00:00.000Z" }), "OUTSIDE_WORKING_HOURS"); // 07:00 local
    await expectCode(book({ startsAt: "2026-10-20T21:30:00.000Z" }), "OUTSIDE_WORKING_HOURS"); // 18:30 local
    await expectCode(book({ startsAt: "2026-10-25T13:00:00.000Z" }), "OUTSIDE_WORKING_HOURS"); // Sunday
    await expectCode(book({ startsAt: "2026-10-14T13:00:00.000Z" }), "PAST_APPOINTMENT");
  });

  it("validates the input", async () => {
    await expectCode(book({ startsAt: "tomorrow" }), "VALIDATION");
    await expectCode(book({ patientId: "not-a-uuid" }), "VALIDATION");
    await expectCode(book({ durationMin: 0 }), "VALIDATION");
  });

  it("returns NOT_FOUND for records of another clinic and INACTIVE_RESOURCE for inactive ones", async () => {
    const foreignPatient = await createPatient(prisma, clinicB);
    await expectCode(book({ patientId: foreignPatient.id }), "NOT_FOUND");
    await prisma.dentist.update({ where: { id: dentistId }, data: { active: false } });
    await expectCode(book(), "INACTIVE_RESOURCE");
  });

  it("forbids roles without appointment:create", async () => {
    await expectCode(book({}, "dentist"), "FORBIDDEN");
  });

  it("lists free slots excluding booked ones", async () => {
    const input = { dentistId, procedureId, day: "2026-10-20" };
    const before = await freeSlots(ctxFor(prisma, clinicA), input);
    expect(before).toHaveLength(20); // 08:00-18:00 every 30 min
    expect(before[0]).toBe("2026-10-20T11:00:00.000Z");
    await book();
    const after = await freeSlots(ctxFor(prisma, clinicA), input);
    expect(after).toHaveLength(19);
    expect(after).not.toContain(TUESDAY_10H);
  });

  it("builds the day agenda for the clinic's local day, in order, for this clinic only", async () => {
    await book({ startsAt: "2026-10-20T15:00:00.000Z" });
    await book();
    // 23:30 local on the 20th is already the 21st in UTC: must stay on the 20th.
    await prisma.appointment.create({
      data: {
        organizationId: clinicA, patientId, dentistId, procedureId,
        startsAt: new Date("2026-10-21T02:30:00.000Z"), endsAt: new Date("2026-10-21T03:00:00.000Z"),
      },
    });
    const otherDentist = await createDentist(prisma, clinicB);
    const otherProcedure = await createProcedure(prisma, clinicB);
    const otherPatient = await createPatient(prisma, clinicB);
    await prisma.appointment.create({
      data: {
        organizationId: clinicB, patientId: otherPatient.id, dentistId: otherDentist.id, procedureId: otherProcedure.id,
        startsAt: new Date(TUESDAY_10H), endsAt: new Date("2026-10-20T13:30:00.000Z"),
      },
    });

    const agenda = await listDay(ctxFor(prisma, clinicA), { day: "2026-10-20" });
    expect(agenda.map((a) => a.startsAt)).toEqual([TUESDAY_10H, "2026-10-20T15:00:00.000Z", "2026-10-21T02:30:00.000Z"]);
    expect(await listDay(ctxFor(prisma, clinicA), { day: "2026-10-21" })).toEqual([]);
  });

  it("hides cancelled appointments from the agenda unless asked", async () => {
    const appointment = await book();
    await changeAppointmentStatus(ctxFor(prisma, clinicA), appointment.id, "CANCELLED");
    expect(await listDay(ctxFor(prisma, clinicA), { day: "2026-10-20" })).toEqual([]);
    expect(await listDay(ctxFor(prisma, clinicA), { day: "2026-10-20", includeCancelled: true })).toHaveLength(1);
  });

  it("follows the allowed status transitions", async () => {
    const ctx = ctxFor(prisma, clinicA);
    const appointment = await book();
    expect((await changeAppointmentStatus(ctx, appointment.id, "CONFIRMED")).status).toBe("CONFIRMED");
    expect((await changeAppointmentStatus(ctx, appointment.id, "COMPLETED")).status).toBe("COMPLETED");
    await expectCode(changeAppointmentStatus(ctx, appointment.id, "CANCELLED"), "INVALID_TRANSITION");
    await expectCode(changeAppointmentStatus(ctx, "00000000-0000-4000-8000-000000000000", "CONFIRMED"), "NOT_FOUND");
  });

  it("confirms a pending appointment created outside the secretary flow", async () => {
    const row = await prisma.appointment.create({
      data: {
        organizationId: clinicA, patientId, dentistId, procedureId, status: "PENDING", source: "WHATSAPP",
        startsAt: new Date(TUESDAY_10H), endsAt: new Date("2026-10-20T13:30:00.000Z"),
      },
    });
    const confirmed = await changeAppointmentStatus(ctxFor(prisma, clinicA), row.id, "SCHEDULED");
    expect(confirmed.status).toBe("SCHEDULED");
  });

  it("lets a dentist update status but not cancel", async () => {
    const appointment = await book();
    const dentist = ctxFor(prisma, clinicA, "dentist");
    await expectCode(changeAppointmentStatus(dentist, appointment.id, "CANCELLED"), "FORBIDDEN");
    expect((await changeAppointmentStatus(dentist, appointment.id, "COMPLETED")).status).toBe("COMPLETED");
  });

  it("lists only pending appointments, oldest first, for this clinic", async () => {
    await book({ startsAt: "2026-10-20T15:00:00.000Z" }); // scheduled: not listed
    const pending = (startsAt: string) =>
      prisma.appointment.create({
        data: {
          organizationId: clinicA, patientId, dentistId, procedureId, status: "PENDING", source: "WHATSAPP",
          startsAt: new Date(startsAt), endsAt: new Date(new Date(startsAt).getTime() + 1_800_000),
        },
      });
    await pending("2026-10-22T13:00:00.000Z");
    await pending("2026-10-21T13:00:00.000Z");

    const list = await listPending(ctxFor(prisma, clinicA));
    expect(list.map((a) => a.startsAt)).toEqual(["2026-10-21T13:00:00.000Z", "2026-10-22T13:00:00.000Z"]);
    expect(await listPending(ctxFor(prisma, clinicB))).toEqual([]);
  });
});
