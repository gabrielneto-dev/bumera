import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PHONE = "+5511987654321";

describe("replies to a reactivation message", () => {
  let clinic: string;
  let dentistId: string;
  let procedureId: string;
  let patientId: string;
  let appointmentId: string;
  let reminderId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    dentistId = (await createDentist(prisma, clinic)).id;
    procedureId = (await createProcedure(prisma, clinic, "Limpeza")).id;
    patientId = (await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE })).id;
    const startsAt = new Date(NOW.getTime() - 180 * DAY);
    appointmentId = (
      await prisma.appointment.create({
        data: { organizationId: clinic, patientId, dentistId, procedureId, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status: "COMPLETED" },
      })
    ).id;
    reminderId = (
      await prisma.reminder.create({
        data: { organizationId: clinic, appointmentId, kind: "REACTIVATION", status: "SENT", attempts: 1, dueAt: new Date(NOW.getTime() - DAY), sentAt: new Date(NOW.getTime() - DAY) },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const receive = (text: string) => handleInboundMessage(prisma, { instance: "bumera-teste", organizationId: clinic, phoneE164: PHONE, text, messageId: "m1" }, NOW);

  it("records interest on reply 1 and acknowledges it", async () => {
    expect(await receive("1")).toMatchObject({ outcome: "INTERESTED", appointmentId });

    const row = await prisma.reminder.findUniqueOrThrow({ where: { id: reminderId } });
    expect(row).toMatchObject({ answer: "INTERESTED", answeredAt: NOW, handledAt: null });
    const reply = await prisma.reminder.findFirstOrThrow({ where: { appointmentId, kind: "REPLY_INTERESTED" } });
    expect(reply.status).toBe("PENDING");
  });

  it("records a refusal on reply 2", async () => {
    expect(await receive("2")).toMatchObject({ outcome: "DECLINED", appointmentId });

    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: reminderId } })).answer).toBe("DECLINED");
    expect(await prisma.reminder.count({ where: { kind: "REPLY_DECLINED" } })).toBe(1);
  });

  it("answers the campaign only once", async () => {
    await receive("1");
    expect(await receive("1")).toEqual({ outcome: "NO_APPOINTMENT" });
    expect(await prisma.reminder.count({ where: { kind: "REPLY_INTERESTED" } })).toBe(1);
  });

  it("ignores a campaign message older than two weeks", async () => {
    await prisma.reminder.update({ where: { id: reminderId }, data: { sentAt: new Date(NOW.getTime() - 20 * DAY) } });
    expect(await receive("1")).toEqual({ outcome: "NO_APPOINTMENT" });
  });

  it("keeps confirming appointments when the latest message was an appointment reminder", async () => {
    const startsAt = new Date(NOW.getTime() + 24 * HOUR);
    const upcoming = await prisma.appointment.create({
      data: { organizationId: clinic, patientId, dentistId, procedureId, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) },
    });
    await prisma.reminder.create({
      data: { organizationId: clinic, appointmentId: upcoming.id, kind: "CONFIRMATION", status: "SENT", attempts: 1, dueAt: NOW, sentAt: new Date(NOW.getTime() - HOUR) },
    });

    expect(await receive("1")).toMatchObject({ outcome: "CONFIRMED", appointmentId: upcoming.id });
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: reminderId } })).answer).toBeNull();
  });

  it("still opts out on SAIR", async () => {
    expect(await receive("SAIR")).toMatchObject({ outcome: "OPTED_OUT" });
  });
});
