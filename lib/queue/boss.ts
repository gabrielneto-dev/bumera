import { PgBoss, type ConstructorOptions } from "pg-boss";

/**
 * pg-boss setup for the worker (`CTX-DEC-20261025-queue-pg-boss`). Measured in the Phase 0 spike:
 * LISTEN/NOTIFY missed jobs deferred with `startAfter` (our debounce), so we poll; and a dead
 * worker's job is only retried on the supervise cycle, so it runs often.
 */

/** Postgres schema owned by pg-boss inside each app database (outside Prisma's migrations). */
export const QUEUE_SCHEMA = "pgboss";
export const POLLING_INTERVAL_SECONDS = 0.5;
const SUPERVISE_INTERVAL_SECONDS = 10;

/**
 * The worker runs queues, supervision and cron schedules. A producer (the web app) only enqueues: no
 * supervision or schedules, so several app processes never compete for maintenance.
 */
export type BossRole = "worker" | "producer";
const PRODUCER_POOL_SIZE = 2;

export function bossOptions(connectionString: string, role: BossRole = "worker"): ConstructorOptions {
  const common = { connectionString, schema: QUEUE_SCHEMA, useListenNotify: false };
  if (role === "producer") return { ...common, supervise: false, schedule: false, max: PRODUCER_POOL_SIZE };
  return { ...common, superviseIntervalSeconds: SUPERVISE_INTERVAL_SECONDS, monitorIntervalSeconds: SUPERVISE_INTERVAL_SECONDS };
}

export function createBoss(connectionString: string, role: BossRole = "worker"): PgBoss {
  return new PgBoss(bossOptions(connectionString, role));
}
