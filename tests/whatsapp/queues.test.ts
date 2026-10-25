import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgBoss } from "pg-boss";
import { createPrismaClient } from "@/lib/prisma";
import { createBoss } from "@/lib/queue/boss";
import { startWorker } from "@/lib/queue/worker";
import { DISPATCH_JOB, SEND_JOB, TURN_JOB } from "@/lib/whatsapp/jobs";
import { whatsappWorkerSetup } from "@/lib/whatsapp/queues";
import { silentLogger } from "../helpers/logger";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const channel = { sendText: async () => ({ ok: true as const, providerMessageId: null }) };

describe("whatsappWorkerSetup", () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = createBoss(process.env.DATABASE_URL as string);
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
    await prisma.$disconnect();
  });

  it("runs turns, dispatch and sends, and dispatches every minute, when the worker is the sender", async () => {
    const setup = whatsappWorkerSetup({ prisma, boss, channel, sender: "worker" });

    expect(setup.queues.map((queue) => queue.name)).toEqual([TURN_JOB.name, DISPATCH_JOB.name, SEND_JOB.name]);
    expect(setup.schedules).toEqual([expect.objectContaining({ spec: DISPATCH_JOB, cron: "* * * * *" })]);
  });

  it("registers the schedule in pg-boss, and removes it when n8n is the sender again", async () => {
    const worker = await startWorker({ boss, log: silentLogger(), ...whatsappWorkerSetup({ prisma, boss, channel, sender: "worker" }) });
    expect((await boss.getSchedules(DISPATCH_JOB.name)).length).toBe(1);
    await worker.stop();

    const legacyBoss = createBoss(process.env.DATABASE_URL as string);
    await legacyBoss.start();
    const legacy = await startWorker({ boss: legacyBoss, log: silentLogger(), ...whatsappWorkerSetup({ prisma, boss: legacyBoss, channel: null, sender: "n8n" }) });
    expect(await legacyBoss.getSchedules(DISPATCH_JOB.name)).toEqual([]);
    await legacy.stop();
  });

  it("consumes nothing when n8n is the sender", () => {
    expect(whatsappWorkerSetup({ prisma, boss, channel: null, sender: "n8n" })).toMatchObject({ queues: [], schedules: [], unschedule: [DISPATCH_JOB.name] });
  });

  it("refuses to send without an Evolution channel", () => {
    expect(() => whatsappWorkerSetup({ prisma, boss, channel: null, sender: "worker" })).toThrow(/EVOLUTION/);
  });
});
