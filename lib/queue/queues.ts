import { fromPrisma, type PgBoss, type PrismaTransactionLike, type SendOptions } from "pg-boss";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { Logger } from "@/lib/log";

/** Context handed to every job handler. */
export interface JobContext {
  jobId: string;
  /** 0 on the first run, 1+ on retries. */
  retryCount: number;
  log: Logger;
}

export interface QueueDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  payload: S;
  /** Retries after the first failure. */
  retryLimit?: number;
  retryDelaySeconds?: number;
  /** A run without a heartbeat for this long is considered dead and retried. */
  heartbeatSeconds?: number;
  /** At most one running job per `group` (e.g. one turn per conversation). */
  serializeByGroup?: boolean;
  handle(data: z.infer<S>, context: JobContext): Promise<void>;
}

export function defineQueue<S extends z.ZodType>(definition: QueueDefinition<S>): QueueDefinition<S> {
  return definition;
}

export interface EnqueueOptions {
  /** Prisma interactive transaction: the job is created only if it commits. */
  tx?: PrismaTransactionLike;
  startAfter?: Date;
  /** Serialization group (see `serializeByGroup`). */
  group?: string;
}

function validPayload<S extends z.ZodType>(queue: QueueDefinition<S>, data: z.infer<S>): object {
  const parsed = queue.payload.safeParse(data);
  if (!parsed.success) {
    throw new AppError("VALIDATION", `invalid payload for queue ${queue.name}`, {
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
  };
}

export async function enqueue<S extends z.ZodType>(
  boss: PgBoss,
  queue: QueueDefinition<S>,
  data: z.infer<S>,
  options: EnqueueOptions = {},
): Promise<void> {
  await boss.send(queue.name, validPayload(queue, data), sendOptions(options));
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
  queue: QueueDefinition<S>,
  data: z.infer<S>,
  options: DebounceOptions,
): Promise<void> {
  const { key, delayMs, ...rest } = options;
  await boss.upsert(queue.name, validPayload(queue, data), {
    ...sendOptions(rest),
    singletonKey: key,
    startAfter: new Date(Date.now() + delayMs),
  });
}
