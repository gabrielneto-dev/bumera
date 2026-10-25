import type { PgBoss } from "pg-boss";
import type { PrismaClient } from "@/generated/prisma/client";
import { defineQueue, type QueueDefinition } from "@/lib/queue/queues";
import type { WorkerSchedule } from "@/lib/queue/worker";
import type { WhatsappChannel } from "@/lib/whatsapp/evolution-client";
import { DISPATCH_GROUP, DISPATCH_JOB, SEND_JOB, TURN_JOB } from "@/lib/whatsapp/jobs";
import type { WhatsappSender } from "@/lib/whatsapp/mode";
import { createPacer, runDispatch, runSend } from "@/lib/whatsapp/sender";
import { runTurn } from "@/lib/whatsapp/turn";

/** Time-based reminders (and failed replies due again) are picked up by this cron; replies get an immediate dispatch. */
const DISPATCH_CRON = "* * * * *";

export interface WhatsappWorkerDeps {
  prisma: PrismaClient;
  boss: PgBoss;
  /** Required when the worker is the sender. */
  channel: WhatsappChannel | null;
  sender: WhatsappSender;
}

export interface WhatsappWorkerSetup {
  queues: QueueDefinition[];
  schedules: WorkerSchedule[];
  /** Schedules to remove (left over from a time the worker was the sender). */
  unschedule: string[];
}

export function whatsappWorkerSetup({ prisma, boss, channel, sender }: WhatsappWorkerDeps): WhatsappWorkerSetup {
  // The n8n workflow sends: consuming here too would send twice.
  if (sender !== "worker") return { queues: [], schedules: [], unschedule: [DISPATCH_JOB.name] };
  if (!channel) throw new Error("WHATSAPP_SENDER=worker needs EVOLUTION_API_URL and EVOLUTION_API_KEY");

  const pacer = createPacer(prisma);
  const queues: QueueDefinition[] = [
    defineQueue({
      ...TURN_JOB,
      async handle(data) {
        await runTurn({ prisma, boss }, data, new Date());
      },
    }),
    defineQueue({
      ...DISPATCH_JOB,
      async handle(_data, { log }) {
        const handed = await runDispatch({ prisma, boss }, new Date());
        if (handed > 0) log.info("whatsapp.dispatched", { count: handed });
      },
    }),
    defineQueue({
      ...SEND_JOB,
      async handle(data, { log }) {
        const outcome = await runSend({ prisma, channel, pacer }, data);
        log.info("whatsapp.send", { reminderId: data.reminderId, attempt: data.attempt, outcome });
      },
    }),
  ];
  return { queues, schedules: [{ spec: DISPATCH_JOB, cron: DISPATCH_CRON, data: {}, group: DISPATCH_GROUP }], unschedule: [] };
}
