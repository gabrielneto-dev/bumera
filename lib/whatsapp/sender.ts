import type { PgBoss } from "pg-boss";
import type { PrismaClient } from "@/generated/prisma/client";
import { claimDueReminders, loadClaimedReminder, recordReminderResult } from "@/lib/reminders/dispatch";
import { isReplyKind } from "@/lib/reminders/guard";
import { enqueue } from "@/lib/queue/queues";
import type { WhatsappChannel } from "@/lib/whatsapp/evolution-client";
import { SEND_JOB } from "@/lib/whatsapp/jobs";
import { sendDelayMs } from "@/lib/whatsapp/pacing";
import { requestDispatch } from "@/lib/whatsapp/turn";

/**
 * Outbound side of the worker pipeline (replaces the n8n workflow). The `reminder` table stays the outbox
 * (CTX-DEC-20261025-migration-roadmap): the dispatcher claims what is due, with the same rules as /due (quiet
 * hours, daily limit, guards), and each message is sent by a job serialized per WhatsApp number.
 */
const DISPATCH_BATCH = 50;
const REPLY_PRIORITY = 10;

export const sendGroup = (instance: string): string => `send:${instance}`;

export async function runDispatch(deps: { prisma: PrismaClient; boss: PgBoss }, now: Date): Promise<number> {
  const due = await claimDueReminders(deps.prisma, { now, limit: DISPATCH_BATCH });
  for (const item of due) {
    await enqueue(
      deps.boss,
      SEND_JOB,
      { reminderId: item.id, attempt: item.attempt },
      { group: sendGroup(item.whatsapp.instance), priority: isReplyKind(item.kind) ? REPLY_PRIORITY : 0 },
    );
  }
  // A full batch means more is waiting: go again right away instead of waiting for the cron.
  if (due.length === DISPATCH_BATCH) await requestDispatch(deps.boss);
  return due.length;
}

/** When each WhatsApp number last sent something. Memory first (one worker), the outbox after a restart. */
export interface Pacer {
  lastSentAt(instance: string): Promise<Date | null>;
  markSent(instance: string, at: Date): void;
}

export function createPacer(prisma: PrismaClient): Pacer {
  const last = new Map<string, Date>();
  return {
    async lastSentAt(instance) {
      const known = last.get(instance);
      if (known) return known;
      const clinic = await prisma.clinicSettings.findFirst({ where: { whatsappInstance: instance }, select: { organizationId: true } });
      if (!clinic) return null;
      const latest = await prisma.reminder.findFirst({ where: { organizationId: clinic.organizationId, status: "SENT" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } });
      return latest?.sentAt ?? null;
    },
    markSent(instance, at) {
      last.set(instance, at);
    },
  };
}

export interface SendDeps {
  prisma: PrismaClient;
  channel: WhatsappChannel;
  pacer: Pacer;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
}

export type SendOutcome = "SENT" | "FAILED" | "STALE";

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runSend(deps: SendDeps, job: { reminderId: string; attempt: number }): Promise<SendOutcome> {
  const { prisma, channel, pacer, sleep = realSleep, random = Math.random, now = () => new Date() } = deps;
  const claimed = await loadClaimedReminder(prisma, job.reminderId, job.attempt);
  if (!claimed) return "STALE";
  const { due } = claimed;
  const instance = due.whatsapp.instance;

  await sleep(
    sendDelayMs({
      now: now(),
      lastSentAt: await pacer.lastSentAt(instance),
      reply: claimed.isReply ? { createdAt: claimed.createdAt, textLength: due.message.length } : null,
      random,
    }),
  );
  // The wait may have been seconds: something may have changed it (cancelled, opted out, re-claimed).
  if (!(await loadClaimedReminder(prisma, job.reminderId, job.attempt))) return "STALE";

  const result = await channel.sendText({ instance, phoneE164: due.patient.phone, text: due.message });
  if (result.ok) {
    pacer.markSent(instance, now());
    await recordReminderResult(prisma, job.reminderId, { outcome: "sent", attempt: job.attempt, providerMessageId: result.providerMessageId }, now());
    return "SENT";
  }
  await recordReminderResult(prisma, job.reminderId, { outcome: "failed", attempt: job.attempt, error: result.error }, now());
  return "FAILED";
}
