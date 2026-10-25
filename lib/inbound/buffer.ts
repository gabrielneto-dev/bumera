import type { PrismaClient } from "@/generated/prisma/client";
import { isUniqueViolation } from "@/lib/db-errors";
import { handleInboundMessage, type ClinicMessage, type InboundOutcome } from "@/lib/inbound/handle";

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

type BufferedRow = { instance: string; messageId: string; text: string; mediaKind: string | null };

/**
 * One message for the whole burst. Written texts are joined and answered (an audio sent along with text is
 * then left to the text); a burst of media only is answered as media. The id is the last message's.
 */
export function joinBurst(organizationId: string, phoneE164: string, rows: readonly BufferedRow[]): ClinicMessage {
  const last = rows.at(-1);
  if (!last) throw new Error("empty burst");
  const texts = rows.map((row) => row.text).filter((text) => text.trim() !== "");
  const base = { organizationId, phoneE164, instance: last.instance, messageId: last.messageId };
  if (texts.length > 0) return { ...base, text: texts.join(JOIN_SEPARATOR) };
  const mediaKind = rows.findLast((row) => row.mediaKind)?.mediaKind as ClinicMessage["mediaKind"];
  return { ...base, text: "", ...(mediaKind ? { mediaKind } : {}) };
}

type Handler = (prisma: PrismaClient, message: ClinicMessage, now: Date) => Promise<InboundOutcome>;

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
    await handler(prisma, joinBurst(organizationId, phoneE164, rows), now);
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

/** Answers what one number wrote, whatever the quiet time (the worker's turn job decides when). */
export async function flushNumber(prisma: PrismaClient, organizationId: string, phoneE164: string, now: Date, handler: Handler = handleInboundMessage): Promise<boolean> {
  return answerRows(prisma, organizationId, phoneE164, await numberRows(prisma, organizationId, phoneE164), now, handler);
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
