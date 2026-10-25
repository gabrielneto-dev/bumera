import { describe, expect, it } from "vitest";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createBoss, QUEUE_SCHEMA } from "@/lib/queue/boss";
import { defineQueue, enqueue } from "@/lib/queue/queues";
import { startWorker } from "@/lib/queue/worker";
import { silentLogger } from "../helpers/logger";
import { waitFor } from "../helpers/wait";

describe("startWorker", () => {
  it("lets an in-flight job finish before stop() resolves", async () => {
    let finished = false;
    let started = false;
    const slowQueue = defineQueue({
      name: "test.slow",
      payload: z.object({ id: z.string() }),
      async handle() {
        started = true;
        await new Promise((resolve) => setTimeout(resolve, 800));
        finished = true;
      },
    });
    await prisma.$executeRawUnsafe(`delete from ${QUEUE_SCHEMA}.job where name = $1`, slowQueue.name).catch(() => 0);
    const boss = createBoss(process.env.DATABASE_URL!);
    await boss.start();
    const worker = await startWorker({ boss, queues: [slowQueue], log: silentLogger() });

    await enqueue(boss, slowQueue, { id: "x" });
    await waitFor(() => started);
    await worker.stop();

    expect(finished).toBe(true);
  });

  it("reports itself healthy only while running", async () => {
    const boss = createBoss(process.env.DATABASE_URL!);
    await boss.start();
    const worker = await startWorker({ boss, queues: [], log: silentLogger() });
    expect(worker.isHealthy()).toBe(true);

    await worker.stop();
    expect(worker.isHealthy()).toBe(false);
  });

  it("can be started twice against the same database (queues are created idempotently)", async () => {
    const queue = defineQueue({ name: "test.idempotent", payload: z.object({}), async handle() {} });
    for (let i = 0; i < 2; i++) {
      const boss = createBoss(process.env.DATABASE_URL!);
      await boss.start();
      const worker = await startWorker({ boss, queues: [queue], log: silentLogger() });
      await worker.stop();
    }
  });
});
