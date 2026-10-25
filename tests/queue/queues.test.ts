import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { bossOptions, createBoss, QUEUE_SCHEMA } from "@/lib/queue/boss";
import { defineQueue, enqueue, enqueueDebounced } from "@/lib/queue/queues";
import { startWorker, type RunningWorker } from "@/lib/queue/worker";
import { silentLogger } from "../helpers/logger";
import { waitFor } from "../helpers/wait";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Run {
  data: { id: string; text?: string };
  startedAt: number;
  endedAt?: number;
}

const runs: Run[] = [];
const failOnce = new Set<string>();
const handlerDelayMs = { value: 0 };

const testQueue = defineQueue({
  name: "test.echo",
  payload: z.object({ id: z.string(), text: z.string().optional() }),
  retryLimit: 1,
  retryDelaySeconds: 1,
  serializeByGroup: true,
  async handle(data) {
    const run: Run = { data, startedAt: Date.now() };
    runs.push(run);
    if (handlerDelayMs.value > 0) await sleep(handlerDelayMs.value);
    if (failOnce.delete(data.id)) throw new Error("boom");
    run.endedAt = Date.now();
  },
});

let boss: PgBoss;
let worker: RunningWorker;

async function jobRows(): Promise<{ state: string; data: unknown }[]> {
  return prisma.$queryRawUnsafe(
    `select state, data from ${QUEUE_SCHEMA}.job where name = $1 order by created_on`,
    testQueue.name,
  );
}

beforeAll(async () => {
  boss = createBoss(process.env.DATABASE_URL!);
  await boss.start();
  worker = await startWorker({ boss, queues: [testQueue], log: silentLogger() });
});

afterAll(async () => {
  await worker.stop();
});

beforeEach(async () => {
  runs.length = 0;
  failOnce.clear();
  handlerDelayMs.value = 0;
  await prisma.$executeRawUnsafe(`delete from ${QUEUE_SCHEMA}.job where name = $1`, testQueue.name);
});

describe("bossOptions", () => {
  it("polls instead of LISTEN/NOTIFY and supervises often enough to recover dead workers", () => {
    const options = bossOptions("postgres://u:p@localhost:5432/x_test");
    expect(options.schema).toBe(QUEUE_SCHEMA);
    expect(options.useListenNotify).toBe(false);
    expect(options.superviseIntervalSeconds).toBeLessThanOrEqual(15);
  });
});

describe("enqueue", () => {
  it("runs the handler with the validated payload", async () => {
    await enqueue(boss, testQueue, { id: "a", text: "hello" });

    await waitFor(() => runs.length === 1);
    expect(runs[0].data).toEqual({ id: "a", text: "hello" });
  });

  it("rejects an invalid payload before touching the database", async () => {
    await expect(enqueue(boss, testQueue, { id: 42 } as never)).rejects.toBeInstanceOf(AppError);
    expect(await jobRows()).toHaveLength(0);
  });

  it("creates no job when the surrounding transaction rolls back", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueue(boss, testQueue, { id: "rolled-back" }, { tx });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(await jobRows()).toHaveLength(0);
  });

  it("commits the job together with the transaction", async () => {
    await prisma.$transaction(async (tx) => {
      await enqueue(boss, testQueue, { id: "committed" }, { tx });
    });

    await waitFor(() => runs.some((run) => run.data.id === "committed"));
  });

  it("retries a job whose handler failed", async () => {
    failOnce.add("flaky");
    await enqueue(boss, testQueue, { id: "flaky" });

    await waitFor(() => runs.filter((run) => run.data.id === "flaky").length === 2, 10_000);
    expect(runs.at(-1)?.endedAt).toBeDefined();
  });
});

describe("enqueueDebounced", () => {
  it("collapses a burst into one run with the last payload, after the window", async () => {
    const started = Date.now();
    for (const text of ["m1", "m2", "m3"]) {
      await enqueueDebounced(boss, testQueue, { id: "conv-1", text }, { key: "conv-1", delayMs: 800 });
      await sleep(150);
    }

    await waitFor(() => runs.length === 1);
    await sleep(1200);
    expect(runs).toHaveLength(1);
    expect(runs[0].data.text).toBe("m3");
    expect(runs[0].startedAt - started).toBeGreaterThanOrEqual(800);
  });
});

describe("serializeByGroup", () => {
  it("never runs two jobs of the same group at once, but runs other groups in parallel", async () => {
    handlerDelayMs.value = 600;
    await enqueue(boss, testQueue, { id: "g1-a" }, { group: "g1" });
    await enqueue(boss, testQueue, { id: "g1-b" }, { group: "g1" });
    await enqueue(boss, testQueue, { id: "g2-a" }, { group: "g2" });

    await waitFor(() => runs.length === 3 && runs.every((run) => run.endedAt), 10_000);
    const [first, second] = runs.filter((run) => run.data.id.startsWith("g1"));
    expect(second.startedAt).toBeGreaterThanOrEqual(first.endedAt!);
    const other = runs.find((run) => run.data.id === "g2-a")!;
    expect(other.startedAt).toBeLessThan(first.endedAt!);
  });
});
