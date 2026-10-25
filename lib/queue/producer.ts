import type { PgBoss } from "pg-boss";
import { createBoss } from "@/lib/queue/boss";

/** One enqueue-only pg-boss client per web-app process, started on first use. */
let started: Promise<PgBoss> | null = null;

export function getProducerBoss(): Promise<PgBoss> {
  started ??= (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const boss = createBoss(connectionString, "producer");
    boss.on("error", (error) => console.error("pg-boss producer error", error instanceof Error ? error.message : error));
    await boss.start();
    return boss;
  })().catch((error: unknown) => {
    // A failed start is retried on the next call instead of being cached forever.
    started = null;
    throw error;
  });
  return started;
}

/** For tests and graceful shutdown. */
export async function stopProducerBoss(): Promise<void> {
  if (!started) return;
  const boss = await started.catch(() => null);
  started = null;
  await boss?.stop({ graceful: false });
}
