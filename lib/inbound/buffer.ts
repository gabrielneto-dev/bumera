import type { PrismaClient } from "@/generated/prisma/client";
import { isUniqueViolation } from "@/lib/db-errors";
import { isResetCommand } from "@/lib/booking/text";
import { handleInboundMessage, type ClinicMessage, type InboundOutcome } from "@/lib/inbound/handle";
import { parseIntent } from "@/lib/inbound/intent";

const MAX_QUIET_MS = 60_000;
/** A message whose processing failed is put back for another try only while it is this fresh. */
const RETRY_WINDOW_MS = 10 * 60_000;
const JOIN_SEPARATOR = "\n";

/**
 * How long a number must stay quiet before its messages are answered, so a person who writes "oi", "queria marcar"
 * and "uma limpeza" gets one answer. 0 (the default) answers each message as it arrives.
 */
export function bufferQuietMs(): number {
  const configured = Number(process.env.INBOUND_BUFFER_MS ?? "0");
  return Number.isFinite(configured) ? Math.min(Math.max(Math.trunc(configured), 0), MAX_QUIET_MS) : 0;
}

/** Keeps a message until its number has been quiet for a while. The same delivery repeated is kept once. */
export async function bufferMessage(prisma: PrismaClient, message: ClinicMessage, now: Date): Promise<void> {
  try {
    await prisma.inboundBuffer.create({
      data: {
        organizationId: message.organizationId,
        instance: message.instance,
        phoneE164: message.phoneE164,
        messageId: message.messageId,
        text: message.text,
        mediaKind: message.mediaKind ?? null,
        receivedAt: now,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

class ClaimLost extends Error {}

type Handler = (prisma: PrismaClient, message: ClinicMessage, now: Date) => Promise<InboundOutcome>;

const STANDALONE_NUMBER = /^\d{1,2}$/;

/** Answers the planned messages of a burst one after the other. */
async function answerBurst(prisma: PrismaClient, organizationId: string, phoneE164: string, rows: readonly BufferedRow[], now: Date, handler: Handler): Promise<void> {
  for (const message of planBurst(organizationId, phoneE164, rows)) await handler(prisma, message, now);
}

type BufferedRow = { instance: string; messageId: string; text: string; mediaKind: string | null };

/** Rows that only mean something as a whole message: replies ("1", "2", "SAIR") and menu numbers. */
function standsAlone(row: BufferedRow): boolean {
  const text = row.text.trim();
  return text !== "" && (parseIntent(text) !== "UNKNOWN" || STANDALONE_NUMBER.test(text));
}

function toMessage(organizationId: string, phoneE164: string, group: readonly BufferedRow[]): ClinicMessage {
  const last = group.at(-1) as BufferedRow;
  const base = { organizationId, phoneE164, instance: last.instance, messageId: last.messageId };
  const texts = group.map((row) => row.text).filter((text) => text.trim() !== "");
  // Written text answers the burst (an audio sent along with it is left to the text).
  if (texts.length > 0) return { ...base, text: texts.join(JOIN_SEPARATOR) };
  const mediaKind = group.findLast((row) => row.mediaKind)?.mediaKind as ClinicMessage["mediaKind"];
  return { ...base, text: "", ...(mediaKind ? { mediaKind } : {}) };
}

/**
 * Turns a burst into the messages to answer, in order. Free text written in a row is joined into one message,
 * so the person gets one answer; commands that only work as a whole message stay apart ("1", "2", menu numbers).
 * "SAIR" anywhere wins over everything else. "recomeçar" drops what came before it, and what follows it is read
 * as a fresh start (one answer instead of two).
 */
export function planBurst(organizationId: string, phoneE164: string, rows: readonly BufferedRow[]): ClinicMessage[] {
  if (rows.length === 0) throw new Error("empty burst");
  const optOut = rows.findLast((row) => parseIntent(row.text) === "OPT_OUT");
  if (optOut) return [toMessage(organizationId, phoneE164, [optOut])];

  const resetAt = rows.findLastIndex((row) => isResetCommand(row.text));
  const rest = resetAt >= 0 ? rows.slice(resetAt + 1) : rows;
  if (resetAt >= 0 && rest.length === 0) return [toMessage(organizationId, phoneE164, [rows[resetAt] as BufferedRow])];

  const groups: BufferedRow[][] = [];
  for (const row of rest) {
    const current = groups.at(-1);
    if (standsAlone(row) || !current || standsAlone(current[0] as BufferedRow)) groups.push([row]);
    else current.push(row);
  }
  return groups.map((group, index) => ({ ...toMessage(organizationId, phoneE164, group), ...(resetAt >= 0 && index === 0 ? { restart: true } : {}) }));
}

type Row = Awaited<ReturnType<PrismaClient["inboundBuffer"]["findMany"]>>[number];

const numberRows = (prisma: PrismaClient, organizationId: string, phoneE164: string): Promise<Row[]> =>
  prisma.inboundBuffer.findMany({ where: { organizationId, phoneE164 }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }] });

/**
 * Claims these rows (deleting them; only one caller can win) and answers them as one message. If answering
 * fails, the rows are put back while still fresh, so a retry answers them, and the error is rethrown.
 * Returns false when another caller had already claimed them.
 */
async function answerRows(prisma: PrismaClient, organizationId: string, phoneE164: string, rows: Row[], now: Date, handler: Handler): Promise<boolean> {
  const last = rows.at(-1);
  if (!last) return false;
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.inboundBuffer.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
      if (claimed.count !== rows.length) throw new ClaimLost();
    });
  } catch (error) {
    if (error instanceof ClaimLost) return false;
    throw error;
  }

  try {
    await answerBurst(prisma, organizationId, phoneE164, rows, now, handler);
    return true;
  } catch (error) {
    if (now.getTime() - last.receivedAt.getTime() < RETRY_WINDOW_MS) {
      await prisma.inboundBuffer.createMany({
        data: rows.map((row) => ({ organizationId: row.organizationId, instance: row.instance, phoneE164: row.phoneE164, messageId: row.messageId, text: row.text, mediaKind: row.mediaKind, receivedAt: row.receivedAt })),
        skipDuplicates: true,
      });
    }
    throw error;
  }
}

/**
 * Worker path: answers what one number wrote, whatever the quiet time (the turn job decides when). Turns of a
 * number never run at the same time, so the rows are answered first and deleted after: a worker that dies
 * mid-turn leaves them for the retry, and answering again is safe (every branch of the handler is idempotent
 * per message id). Messages that arrive meanwhile are not deleted; their own turn answers them.
 */
export async function flushNumber(prisma: PrismaClient, organizationId: string, phoneE164: string, now: Date, handler: Handler = handleInboundMessage): Promise<boolean> {
  const rows = await numberRows(prisma, organizationId, phoneE164);
  if (rows.length === 0) return false;
  await answerBurst(prisma, organizationId, phoneE164, rows, now, handler);
  await prisma.inboundBuffer.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  return true;
}

/** How many unanswered messages a number has and when the first of them arrived (for the debounce). */
export async function pendingBurst(prisma: PrismaClient, organizationId: string, phoneE164: string): Promise<{ count: number; firstAt: Date | null }> {
  const result = await prisma.inboundBuffer.aggregate({ where: { organizationId, phoneE164 }, _count: { _all: true }, _min: { receivedAt: true } });
  return { count: result._count._all, firstAt: result._min.receivedAt };
}

/**
 * Legacy path (n8n sender): answers every number that has been quiet for `quietMs`, joining what it wrote
 * into one message. Safe to call from several places at once. Returns how many numbers were answered.
 */
export async function flushBuffered(prisma: PrismaClient, now: Date, quietMs: number, handler: Handler = handleInboundMessage): Promise<number> {
  const cutoff = new Date(now.getTime() - quietMs);
  const old = await prisma.inboundBuffer.findMany({ where: { receivedAt: { lte: cutoff } }, select: { organizationId: true, phoneE164: true } });
  const groups = new Map(old.map((row) => [`${row.organizationId}|${row.phoneE164}`, row]));
  let answered = 0;

  for (const { organizationId, phoneE164 } of groups.values()) {
    const rows = await numberRows(prisma, organizationId, phoneE164);
    // Still writing: the newest message is too recent.
    const last = rows.at(-1);
    if (!last || last.receivedAt.getTime() > cutoff.getTime()) continue;
    if (await answerRows(prisma, organizationId, phoneE164, rows, now, handler)) answered += 1;
  }
  return answered;
}
