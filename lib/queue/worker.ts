import type { Job, PgBoss } from "pg-boss";
import type { Logger } from "@/lib/log";
import { POLLING_INTERVAL_SECONDS } from "@/lib/queue/boss";
import { ensureQueue, type JobSpec, type QueueDefinition } from "@/lib/queue/queues";

/** Jobs processed at once per queue in this process. */
const LOCAL_CONCURRENCY = 5;
/** How long stop() waits for in-flight jobs before giving up on them (they are retried later). */
const STOP_TIMEOUT_MS = 30_000;

export interface RunningWorker {
  isHealthy(): boolean;
  stop(): Promise<void>;
}

/** A job created on a cron by pg-boss (one per occurrence, whatever the number of workers). */
export interface WorkerSchedule {
  spec: JobSpec;
  cron: string;
  data: object;
  /** Serialization group of the created jobs. */
  group?: string;
}

export interface StartWorkerOptions {
  boss: PgBoss;
  queues: QueueDefinition[];
  schedules?: WorkerSchedule[];
  /** Queue names whose schedules must not exist anymore. */
  unschedule?: string[];
  log: Logger;
}

function jobHandler(queue: QueueDefinition, log: Logger) {
  return async ([job]: Job<object>[]) => {
    const jobLog = log.child({ queue: queue.name, jobId: job.id, retry: job.retryCount });
    const parsed = queue.payload.safeParse(job.data);
    if (!parsed.success) {
      jobLog.error("job.invalid_payload");
      throw new Error(`invalid payload for queue ${queue.name}`);
    }
    const startedAt = Date.now();
    try {
      await queue.handle(parsed.data, { jobId: job.id, retryCount: job.retryCount, log: jobLog });
      jobLog.info("job.done", { ms: Date.now() - startedAt });
    } catch (error) {
      jobLog.error("job.failed", { ms: Date.now() - startedAt, error });
      throw error;
    }
  };
}

/** Creates/updates the queues, starts polling them, and returns a handle for health and shutdown. */
export async function startWorker({ boss, queues, schedules = [], unschedule = [], log }: StartWorkerOptions): Promise<RunningWorker> {
  let running = true;
  boss.on("error", (error) => log.error("boss.error", { error }));

  for (const queue of queues) {
    await ensureQueue(boss, queue);
    await boss.work(
      queue.name,
      {
        pollingIntervalSeconds: POLLING_INTERVAL_SECONDS,
        localConcurrency: LOCAL_CONCURRENCY,
        // In-memory limit: the database-wide `groupConcurrency` raced between this process's own
        // pollers (two jobs of one group ran together, measured). This holds only while a single
        // worker process runs; turns also lock their conversation row as a second guard.
        ...(queue.serializeByGroup ? { localGroupConcurrency: 1 } : {}),
      },
      jobHandler(queue, log),
    );
  }
  for (const name of unschedule) {
    if (await boss.getQueue(name)) await boss.unschedule(name);
  }
  for (const schedule of schedules) {
    await ensureQueue(boss, schedule.spec);
    await boss.schedule(schedule.spec.name, schedule.cron, schedule.data, schedule.group ? { group: { id: schedule.group } } : {});
  }
  log.info("worker.started", { queues: queues.map((queue) => queue.name), schedules: schedules.map((schedule) => schedule.spec.name) });

  return {
    isHealthy: () => running,
    async stop() {
      if (!running) return;
      running = false;
      await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
      log.info("worker.stopped");
    },
  };
}
