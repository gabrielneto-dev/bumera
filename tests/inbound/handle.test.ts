import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const PHONE = "+5511987654321";

describe("handleInboundMessage", () => {
  let clinic: string;
  let dentistId: string;
  let procedureId: string;
  let patientId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    dentistId = (await createDentist(prisma, clinic)).id;
    procedureId = (await createProcedure(prisma, clinic)).id;
    patientId = (await createPatient(prisma, clinic, { phoneE164: PHONE })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function appointment(hoursAhead: number, status: "SCHEDULED" | "CONFIRMED" | "CANCELLED" = "SCHEDULED", patient = patientId, org = clinic) {
    const startsAt = new Date(NOW.getTime() + hoursAhead * HOUR);
    return prisma.appointment.create({
      data: {
        organizationId: org,
        patientId: patient,
        dentistId,
        procedureId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status,
      },
    });
  }

  const receive = (text: string, phoneE164 = PHONE) =>
    handleInboundMessage(prisma, { phoneE164, text, messageId: "m1" }, NOW);

  it("confirms the next upcoming appointment on reply 1", async () => {
    const later = await appointment(72);
    const next = await appointment(24);

    const result = await receive("1");

    expect(result).toMatchObject({ outcome: "CONFIRMED", appointmentId: next.id });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: next.id } })).status).toBe("CONFIRMED");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("SCHEDULED");
  });

  it("is safe to repeat: confirming twice keeps it confirmed", async () => {
    const next = await appointment(24);
    await receive("1");
    const again = await receive("1");

    expect(again).toMatchObject({ outcome: "CONFIRMED", appointmentId: next.id });
  });

  it("records a reschedule request on reply 2 without changing the status", async () => {
    const next = await appointment(24);

    const result = await receive("2");

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: next.id } });
    expect(result).toMatchObject({ outcome: "RESCHEDULE_REQUESTED", appointmentId: next.id });
    expect(row.status).toBe("SCHEDULED");
    expect(row.rescheduleRequestedAt).toEqual(NOW);
  });

  it("stops the remaining reminders once a reschedule is requested", async () => {
    const next = await appointment(24);
    await prisma.reminder.create({
      data: { organizationId: clinic, appointmentId: next.id, kind: "REMINDER_2H", dueAt: new Date(NOW.getTime() + 22 * HOUR) },
    });

    await receive("2");

    const reminder = await prisma.reminder.findFirstOrThrow({ where: { appointmentId: next.id } });
    expect(reminder.status).toBe("CANCELLED");
  });

  it("opts the patient out on SAIR and cancels pending reminders", async () => {
    const next = await appointment(24);
    await prisma.reminder.create({
      data: { organizationId: clinic, appointmentId: next.id, kind: "REMINDER_24H", dueAt: NOW },
    });

    const result = await receive("SAIR");

    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
    const reminder = await prisma.reminder.findFirstOrThrow({ where: { appointmentId: next.id } });
    expect(result).toMatchObject({ outcome: "OPTED_OUT", patients: 1 });
    expect(patient.doNotContact).toBe(true);
    expect(patient.optedOutAt).toEqual(NOW);
    expect(reminder.status).toBe("SKIPPED");
  });

  it("opts out every clinic's record of the same phone", async () => {
    const other = await createClinic(prisma, "b");
    const otherPatient = await createPatient(prisma, other, { phoneE164: PHONE });

    const result = await receive("sair");

    expect(result).toMatchObject({ outcome: "OPTED_OUT", patients: 2 });
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: otherPatient.id } })).doNotContact).toBe(true);
  });

  it("matches a phone saved with the ninth digit when WhatsApp sends it without", async () => {
    await appointment(24);
    const result = await receive("1", "+551187654321");

    expect(result.outcome).toBe("CONFIRMED");
  });

  it("ignores cancelled and past appointments", async () => {
    await appointment(24, "CANCELLED");
    await appointment(-2);

    expect(await receive("1")).toEqual({ outcome: "NO_APPOINTMENT" });
  });

  it("ignores unknown phones and unclear replies", async () => {
    await appointment(24);

    expect(await receive("1", "+5511900000000")).toEqual({ outcome: "UNKNOWN_PATIENT" });
    expect(await receive("talvez")).toEqual({ outcome: "IGNORED" });
  });

  it("does not confirm an appointment of a patient who opted out", async () => {
    await prisma.patient.update({ where: { id: patientId }, data: { doNotContact: true } });
    await appointment(24);

    expect(await receive("1")).toEqual({ outcome: "NO_APPOINTMENT" });
  });

  it("with the same phone in two clinics, answers the soonest appointment", async () => {
    const other = await createClinic(prisma, "b");
    const otherPatient = await createPatient(prisma, other, { phoneE164: PHONE });
    const otherDentist = await createDentist(prisma, other);
    const otherProcedure = await createProcedure(prisma, other);
    await appointment(48);
    const startsAt = new Date(NOW.getTime() + 12 * HOUR);
    const soonest = await prisma.appointment.create({
      data: {
        organizationId: other,
        patientId: otherPatient.id,
        dentistId: otherDentist.id,
        procedureId: otherProcedure.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 1_800_000),
      },
    });

    const result = await receive("1");

    expect(result).toMatchObject({ outcome: "CONFIRMED", appointmentId: soonest.id });
  });
});
