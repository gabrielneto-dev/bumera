import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { createPrismaClient } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { syncReminders } from "@/lib/reminders/sync";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const HOUR = 3_600_000;
const PHONE = "+5511987654321";

describe("automatic replies to patients", () => {
  let clinic: string;
  let patientId: string;
  let appointmentId: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    const dentist = await createDentist(prisma, clinic);
    const procedure = await createProcedure(prisma, clinic);
    patientId = (await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE })).id;
    const startsAt = new Date(NOW.getTime() + 24 * HOUR);
    appointmentId = (
      await prisma.appointment.create({
        data: { organizationId: clinic, patientId, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const receive = (text: string, id = "m1") => handleInboundMessage(prisma, { instance: "bumera-teste", organizationId: clinic, phoneE164: PHONE, text, messageId: id }, NOW);
  const replies = () =>
    prisma.reminder.findMany({ where: { appointmentId, kind: { in: ["REPLY_CONFIRMED", "REPLY_RESCHEDULE", "REPLY_OPTED_OUT"] } }, orderBy: { kind: "asc" } });
  const repliesOfKind = (kind: "REPLY_CONFIRMED" | "REPLY_RESCHEDULE" | "REPLY_OPTED_OUT") =>
    prisma.reminder.findMany({ where: { appointmentId, kind } });

  it("queues a confirmation reply that is due immediately", async () => {
    await receive("1");

    const [reply] = await repliesOfKind("REPLY_CONFIRMED");
    expect(reply).toMatchObject({ status: "PENDING", organizationId: clinic });
    expect(reply?.dueAt).toEqual(NOW);
  });

  it("sends one reply per appointment even when the patient answers twice or the webhook repeats", async () => {
    await receive("1", "m1");
    await receive("1", "m1");
    await receive("1", "m2");

    expect(await repliesOfKind("REPLY_CONFIRMED")).toHaveLength(1);
  });

  it("keeps the reply pending after the reminders are re-synced", async () => {
    await receive("1");
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });

    await syncReminders(prisma as never, row, NOW);

    expect((await repliesOfKind("REPLY_CONFIRMED"))[0]?.status).toBe("PENDING");
  });

  it("queues a reschedule reply and stops the other reminders but not the reply", async () => {
    await prisma.reminder.create({ data: { organizationId: clinic, appointmentId, kind: "REMINDER_2H", dueAt: new Date(NOW.getTime() + 22 * HOUR) } });

    await receive("2");

    expect((await repliesOfKind("REPLY_RESCHEDULE"))[0]?.status).toBe("PENDING");
    expect((await prisma.reminder.findFirstOrThrow({ where: { appointmentId, kind: "REMINDER_2H" } })).status).toBe("CANCELLED");
  });

  it("queues an opt-out acknowledgement while skipping everything else", async () => {
    await prisma.reminder.create({ data: { organizationId: clinic, appointmentId, kind: "REMINDER_24H", dueAt: NOW } });

    await receive("SAIR");

    expect((await repliesOfKind("REPLY_OPTED_OUT"))[0]?.status).toBe("PENDING");
    expect((await prisma.reminder.findFirstOrThrow({ where: { appointmentId, kind: "REMINDER_24H" } })).status).toBe("SKIPPED");
  });

  it("hands the opt-out acknowledgement to n8n even though the patient is now opted out", async () => {
    await receive("SAIR");

    const due = await claimDueReminders(prisma, { now: NOW });

    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ kind: "REPLY_OPTED_OUT", patient: { phone: PHONE } });
    expect(due[0]?.message).toContain("Clinic a");
  });

  it("sends no reply for unclear messages or unknown phones", async () => {
    await receive("talvez");
    await handleInboundMessage(prisma, { instance: "bumera-teste", organizationId: clinic, phoneE164: "+5511900000000", text: "1", messageId: "x" }, NOW);

    expect(await replies()).toHaveLength(0);
  });

  it("does not acknowledge an opt-out when the patient has no appointment to attach it to", async () => {
    await prisma.appointment.delete({ where: { id: appointmentId } });

    expect(await receive("SAIR")).toMatchObject({ outcome: "OPTED_OUT" });
    expect(await prisma.reminder.count()).toBe(0);
  });
});
