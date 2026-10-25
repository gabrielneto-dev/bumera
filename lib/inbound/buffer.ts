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

/**
 * Answers every number that has been quiet for `quietMs`, joining what it wrote into one message. Safe to call from
 * several places at once: a group of messages is claimed by deleting it, and only one caller can win that.
 * Returns how many numbers were answered.
 */
export async function flushBuffered(prisma: PrismaClient, now: Date, quietMs: number, handler: Handler = handleInboundMessage): Promise<number> {
  const cutoff = new Date(now.getTime() - quietMs);
  const old = await prisma.inboundBuffer.findMany({ where: { receivedAt: { lte: cutoff } }, select: { organizationId: true, phoneE164: true } });
  const groups = new Map(old.map((row) => [`${row.organizationId}|${row.phoneE164}`, row]));
  let answered = 0;

  for (const { organizationId, phoneE164 } of groups.values()) {
    const rows = await prisma.inboundBuffer.findMany({ where: { organizationId, phoneE164 }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }] });
    const last = rows.at(-1);
    // Still writing: the newest message is too recent.
    if (!last || last.receivedAt.getTime() > cutoff.getTime()) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.inboundBuffer.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
        if (claimed.count !== rows.length) throw new ClaimLost();
      });
    } catch (error) {
      if (error instanceof ClaimLost) continue;
      throw error;
    }

    try {
      await handler(prisma, joinBurst(organizationId, phoneE164, rows), now);
      answered += 1;
    } catch (error) {
      if (now.getTime() - last.receivedAt.getTime() < RETRY_WINDOW_MS) {
        await prisma.inboundBuffer.createMany({ data: rows.map((row) => ({ organizationId: row.organizationId, instance: row.instance, phoneE164: row.phoneE164, messageId: row.messageId, text: row.text, mediaKind: row.mediaKind, receivedAt: row.receivedAt })), skipDuplicates: true });
      }
      throw error;
    }
  }
  return answered;
}
