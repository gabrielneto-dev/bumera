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

export function bossOptions(connectionString: string): ConstructorOptions {
  return {
    connectionString,
    schema: QUEUE_SCHEMA,
    useListenNotify: false,
    superviseIntervalSeconds: SUPERVISE_INTERVAL_SECONDS,
    monitorIntervalSeconds: SUPERVISE_INTERVAL_SECONDS,
  };
}

export function createBoss(connectionString: string): PgBoss {
  return new PgBoss(bossOptions(connectionString));
}
