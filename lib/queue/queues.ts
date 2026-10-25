import { fromPrisma, type PgBoss, type PrismaTransactionLike, type Queue, type SendOptions } from "pg-boss";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { Logger } from "@/lib/log";

const DEFAULT_RETRY_LIMIT = 3;
const DEFAULT_RETRY_DELAY_SECONDS = 5;
const DEFAULT_HEARTBEAT_SECONDS = 15;

/** Context handed to every job handler. */
export interface JobContext {
  jobId: string;
  /** 0 on the first run, 1+ on retries. */
  retryCount: number;
  log: Logger;
}

/** What producers need to know about a queue: its name, payload and options (no handler). */
export interface JobSpec<S extends z.ZodType = z.ZodType> {
  name: string;
  payload: S;
  /** Retries after the first failure. */
  retryLimit?: number;
  retryDelaySeconds?: number;
  /** A run without a heartbeat for this long is considered dead and retried (pg-boss renews it while running). */
  heartbeatSeconds?: number;
  /** At most one running job per `group` (e.g. one turn per number). */
  serializeByGroup?: boolean;
}

export interface QueueDefinition<S extends z.ZodType = z.ZodType> extends JobSpec<S> {
  handle(data: z.infer<S>, context: JobContext): Promise<void>;
}

export function defineJob<S extends z.ZodType>(spec: JobSpec<S>): JobSpec<S> {
  return spec;
}

export function defineQueue<S extends z.ZodType>(definition: QueueDefinition<S>): QueueDefinition<S> {
  return definition;
}

function queueOptions(spec: JobSpec): Omit<Queue, "name" | "policy"> {
  return {
    retryLimit: spec.retryLimit ?? DEFAULT_RETRY_LIMIT,
    retryDelay: spec.retryDelaySeconds ?? DEFAULT_RETRY_DELAY_SECONDS,
    retryBackoff: true,
    heartbeatSeconds: spec.heartbeatSeconds ?? DEFAULT_HEARTBEAT_SECONDS,
  };
}

/** Creates the queue, or brings its options up to date. */
export async function ensureQueue(boss: PgBoss, spec: JobSpec): Promise<void> {
  const options = queueOptions(spec);
  if (await boss.getQueue(spec.name)) {
    await boss.updateQueue(spec.name, options);
  } else {
    await boss.createQueue(spec.name, { ...options, policy: "standard" });
  }
}

/** Queues this process already made sure exist (producers enqueue into queues the worker may not have created yet). */
const ensured = new WeakMap<PgBoss, Set<string>>();

async function ensureQueueOnce(boss: PgBoss, spec: JobSpec): Promise<void> {
  const names = ensured.get(boss) ?? new Set<string>();
  ensured.set(boss, names);
  if (names.has(spec.name)) return;
  if (!(await boss.getQueue(spec.name))) {
    await boss.createQueue(spec.name, { ...queueOptions(spec), policy: "standard" }).catch(async (error: unknown) => {
      // Another process created it in the meantime.
      if (!(await boss.getQueue(spec.name))) throw error;
    });
  }
  names.add(spec.name);
}

export interface EnqueueOptions {
  /** Prisma interactive transaction: the job is created only if it commits. */
  tx?: PrismaTransactionLike;
  startAfter?: Date;
  /** Serialization group (see `serializeByGroup`). */
  group?: string;
  /** Higher runs first. */
  priority?: number;
}

function validPayload<S extends z.ZodType>(spec: JobSpec<S>, data: z.infer<S>): object {
  const parsed = spec.payload.safeParse(data);
  if (!parsed.success) {
    throw new AppError("VALIDATION", `invalid payload for queue ${spec.name}`, {
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return parsed.data as object;
}

function sendOptions(options: EnqueueOptions): SendOptions {
  return {
    ...(options.tx ? { db: fromPrisma(options.tx) } : {}),
    ...(options.startAfter ? { startAfter: options.startAfter } : {}),
    ...(options.group ? { group: { id: options.group } } : {}),
    ...(options.priority !== undefined ? { priority: options.priority } : {}),
  };
}

export async function enqueue<S extends z.ZodType>(
  boss: PgBoss,
  spec: JobSpec<S>,
  data: z.infer<S>,
  options: EnqueueOptions = {},
): Promise<void> {
  const payload = validPayload(spec, data);
  await ensureQueueOnce(boss, spec);
  await boss.send(spec.name, payload, sendOptions(options));
}

export interface DebounceOptions extends Omit<EnqueueOptions, "startAfter"> {
  /** Jobs with the same key that have not started yet collapse into one. */
  key: string;
  delayMs: number;
}

/**
 * Schedules a job `delayMs` from now, or pushes the pending job with the same key to that time
 * (last payload wins). A job that already started is left alone; the new one waits for it when the
 * queue serializes by group.
 */
export async function enqueueDebounced<S extends z.ZodType>(
  boss: PgBoss,
  spec: JobSpec<S>,
  data: z.infer<S>,
  options: DebounceOptions,
): Promise<void> {
  const { key, delayMs, ...rest } = options;
  const payload = validPayload(spec, data);
  await ensureQueueOnce(boss, spec);
  await boss.upsert(spec.name, payload, {
    ...sendOptions(rest),
    singletonKey: key,
    startAfter: new Date(Date.now() + Math.max(delayMs, 0)),
  });
}
