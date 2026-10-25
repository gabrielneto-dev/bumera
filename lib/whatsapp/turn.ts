import type { PgBoss } from "pg-boss";
import type { PrismaClient } from "@/generated/prisma/client";
import { bufferMessage, flushNumber, pendingBurst } from "@/lib/inbound/buffer";
import { turnStartAfter } from "@/lib/inbound/debounce";
import { handleInboundMessage, type ClinicMessage, type InboundOutcome } from "@/lib/inbound/handle";
import { enqueueDebounced } from "@/lib/queue/queues";
import { DISPATCH_GROUP, DISPATCH_JOB, TURN_JOB, turnKey } from "@/lib/whatsapp/jobs";

/**
 * Inbound side of the worker pipeline: the webhook only stores the message and (re)schedules the number's
 * turn; the worker answers the whole burst once the person stops writing, one turn per number at a time.
 */
export async function scheduleTurn(prisma: PrismaClient, boss: PgBoss, message: ClinicMessage, now: Date): Promise<void> {
  await bufferMessage(prisma, message, now);
  const burst = await pendingBurst(prisma, message.organizationId, message.phoneE164);
  const startAfter = turnStartAfter({ now, unseenCount: Math.max(burst.count, 1), firstUnseenAt: burst.firstAt ?? now });
  const key = turnKey(message.organizationId, message.phoneE164);
  await enqueueDebounced(
    boss,
    TURN_JOB,
    { organizationId: message.organizationId, phoneE164: message.phoneE164 },
    { key, group: key, delayMs: startAfter.getTime() - now.getTime() },
  );
}

/** Asks the dispatcher to send what is due now (replies queued by a turn), instead of waiting for its cron. */
export async function requestDispatch(boss: PgBoss): Promise<void> {
  await enqueueDebounced(boss, DISPATCH_JOB, {}, { key: DISPATCH_GROUP, group: DISPATCH_GROUP, delayMs: 0 });
}

type Handler = (prisma: PrismaClient, message: ClinicMessage, now: Date) => Promise<InboundOutcome>;

export interface TurnDeps {
  prisma: PrismaClient;
  boss: PgBoss;
  handler?: Handler;
}

/** One turn: answer what the number wrote (nothing if another turn already did), then send the replies. */
export async function runTurn(deps: TurnDeps, target: { organizationId: string; phoneE164: string }, now: Date): Promise<boolean> {
  const answered = await flushNumber(deps.prisma, target.organizationId, target.phoneE164, now, deps.handler ?? handleInboundMessage);
  if (answered) await requestDispatch(deps.boss);
  return answered;
}
