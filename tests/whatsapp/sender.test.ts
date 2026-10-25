import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PgBoss } from "pg-boss";
import { queueReply } from "@/lib/inbound/reply";
import { createPrismaClient } from "@/lib/prisma";
import { createBoss, QUEUE_SCHEMA } from "@/lib/queue/boss";
import { scopedPrisma } from "@/lib/tenant-scope";
import type { WhatsappChannel } from "@/lib/whatsapp/evolution-client";
import { SEND_JOB } from "@/lib/whatsapp/jobs";
import { createPacer, runDispatch, runSend } from "@/lib/whatsapp/sender";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const PHONE = "+5511987654321";

interface SendJobRow {
  data: { reminderId: string; attempt: number };
  group_id: string;
  priority: number;
}

function fakeChannel(result: Awaited<ReturnType<WhatsappChannel["sendText"]>> = { ok: true, providerMessageId: "WA1" }) {
  const sent: Array<{ instance: string; phoneE164: string; text: string }> = [];
  const channel: WhatsappChannel = {
    async sendText(message) {
      sent.push(message);
      return result;
    },
  };
  return { channel, sent };
}

describe("WhatsApp sender on the worker", () => {
  let boss: PgBoss;
  let clinic: string;
  let replyId: string;
  const slept: number[] = [];
  const sleep = async (ms: number) => {
    slept.push(ms);
  };

  async function sendJobs(): Promise<SendJobRow[]> {
    return prisma.$queryRawUnsafe(`select data, group_id, priority from ${QUEUE_SCHEMA}.job where name = $1 and state = 'created' order by created_on`, SEND_JOB.name);
  }

  beforeAll(async () => {
    boss = createBoss(process.env.DATABASE_URL as string);
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    slept.length = 0;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    await prisma.$executeRawUnsafe(`delete from ${QUEUE_SCHEMA}.job where name like 'whatsapp.%'`).catch(() => 0);
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    const patient = await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: PHONE });
    const dentist = await createDentist(prisma, clinic);
    const procedure = await createProcedure(prisma, clinic);
    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    const appointment = await prisma.appointment.create({
      data: { organizationId: clinic, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000), status: "CONFIRMED" },
    });
    await queueReply(scopedPrisma(prisma, clinic), { organizationId: clinic, appointmentId: appointment.id }, "REPLY_CONFIRMED", new Date());
    replyId = (await prisma.reminder.findFirstOrThrow({ where: { kind: "REPLY_CONFIRMED" } })).id;
  });

  it("claims what is due and hands each message to the sender of its WhatsApp number, replies first", async () => {
    expect(await runDispatch({ prisma, boss }, new Date())).toBe(1);

    const jobs = await sendJobs();
    expect(jobs).toEqual([expect.objectContaining({ data: { reminderId: replyId, attempt: 1 }, group_id: "send:bumera-teste" })]);
    expect(jobs[0].priority).toBeGreaterThan(0);
    expect(await prisma.reminder.findUniqueOrThrow({ where: { id: replyId } })).toMatchObject({ status: "CLAIMED", attempts: 1 });
  });

  it("sends a claimed message to the patient's number and records the delivery with WhatsApp's id", async () => {
    await runDispatch({ prisma, boss }, new Date());
    const { channel, sent } = fakeChannel();

    await runSend({ prisma, channel, pacer: createPacer(prisma), sleep }, { reminderId: replyId, attempt: 1 });

    expect(sent).toEqual([expect.objectContaining({ instance: "bumera-teste", phoneE164: PHONE })]);
    expect(sent[0].text).toMatch(/Maria/);
    expect(await prisma.reminder.findUniqueOrThrow({ where: { id: replyId } })).toMatchObject({ status: "SENT", providerMessageId: "WA1" });
    expect(slept.length).toBe(1);
  });

  it("skips a send whose claim is no longer current (a newer attempt or already sent)", async () => {
    await runDispatch({ prisma, boss }, new Date());
    const { channel, sent } = fakeChannel();

    await runSend({ prisma, channel, pacer: createPacer(prisma), sleep }, { reminderId: replyId, attempt: 2 });

    expect(sent).toEqual([]);
    expect(await prisma.reminder.findUniqueOrThrow({ where: { id: replyId } })).toMatchObject({ status: "CLAIMED" });
  });

  it("records a failure with its code so the reminder's own retry schedule takes over", async () => {
    await runDispatch({ prisma, boss }, new Date());
    const { channel } = fakeChannel({ ok: false, error: "evolution_http_400" });

    await runSend({ prisma, channel, pacer: createPacer(prisma), sleep }, { reminderId: replyId, attempt: 1 });

    expect(await prisma.reminder.findUniqueOrThrow({ where: { id: replyId } })).toMatchObject({ status: "PENDING", note: "evolution_http_400" });
  });

  it("spaces two messages of the same number", async () => {
    await runDispatch({ prisma, boss }, new Date());
    const { channel } = fakeChannel();
    const pacer = createPacer(prisma);
    pacer.markSent("bumera-teste", new Date());

    await runSend({ prisma, channel, pacer, sleep, random: () => 0 }, { reminderId: replyId, attempt: 1 });

    expect(slept[0]).toBeGreaterThanOrEqual(2900);
  });
});
