import { z } from "zod";
import { createLogger } from "@/lib/log";
import { createBoss } from "@/lib/queue/boss";
import { startHealthServer } from "@/lib/queue/health";
import { startWorker } from "@/lib/queue/worker";
import { workerQueues } from "./queues";

/**
 * Worker process: the only place that runs conversation turns and sends WhatsApp messages
 * (`CTX-DEC-20261025-conversation-owned-by-app`). Run exactly one replica (see lib/queue/worker.ts).
 */

const DEFAULT_HEALTH_PORT = 3200;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_HEALTH_PORT),
  WORKER_HEALTH_HOST: z.string().default("127.0.0.1"),
});

async function main(): Promise<void> {
  const log = createLogger().child({ process: "worker" });
  const env = envSchema.parse(process.env);

  const boss = createBoss(env.DATABASE_URL);
  await boss.start();
  const worker = await startWorker({ boss, queues: workerQueues, log });
  const health = await startHealthServer({
    port: env.WORKER_HEALTH_PORT,
    host: env.WORKER_HEALTH_HOST,
    isHealthy: worker.isHealthy,
  });

  const shutdown = async (signal: string) => {
    log.info("worker.shutdown", { signal });
    await worker.stop();
    health.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  createLogger().error("worker.crashed", { error });
  process.exit(1);
});
