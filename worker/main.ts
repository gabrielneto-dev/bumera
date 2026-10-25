import { z } from "zod";
import { createLogger } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { createBoss } from "@/lib/queue/boss";
import { startHealthServer } from "@/lib/queue/health";
import { startWorker } from "@/lib/queue/worker";
import { createEvolutionChannel } from "@/lib/whatsapp/evolution-client";
import { whatsappSender } from "@/lib/whatsapp/mode";
import { whatsappWorkerSetup } from "@/lib/whatsapp/queues";

/**
 * Worker process: answers WhatsApp bursts and sends every WhatsApp message when `WHATSAPP_SENDER=worker`
 * (`CTX-DEC-20261025-migration-roadmap`). Run exactly one replica (see lib/queue/worker.ts).
 */

const DEFAULT_HEALTH_PORT = 3200;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_HEALTH_PORT),
  WORKER_HEALTH_HOST: z.string().default("127.0.0.1"),
  EVOLUTION_API_URL: z.url().optional(),
  EVOLUTION_API_KEY: z.string().min(32).optional(),
});

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const sender = whatsappSender();
  const log = createLogger().child({ process: "worker", sender });

  const boss = createBoss(env.DATABASE_URL);
  await boss.start();
  const channel = env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY ? createEvolutionChannel({ baseUrl: env.EVOLUTION_API_URL, apiKey: env.EVOLUTION_API_KEY }) : null;
  const worker = await startWorker({ boss, log, ...whatsappWorkerSetup({ prisma, boss, channel, sender }) });
  const health = await startHealthServer({
    port: env.WORKER_HEALTH_PORT,
    host: env.WORKER_HEALTH_HOST,
    isHealthy: worker.isHealthy,
  });

  const shutdown = async (signal: string) => {
    log.info("worker.shutdown", { signal });
    await worker.stop();
    health.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  createLogger().error("worker.crashed", { error });
  process.exit(1);
});
