/**
 * How long to wait before sending through one WhatsApp number. Fixed, fast sending is what gets unofficial
 * numbers banned (CTX-RSK-20261014-whatsapp-unofficial-api): messages of one number keep a minimum gap with
 * random jitter, and a reply looks typed (a delay that grows with its length, counted from when it was
 * written, so the debounce and the turn already count as "reading").
 */
const MIN_INTERVAL_MS = 3000;
const JITTER_MAX_MS = 2000;
const TYPING_BASE_MS = 1500;
const TYPING_MS_PER_CHAR = 20;
const TYPING_MAX_MS = 6000;

export function humanDelayMs(textLength: number): number {
  return Math.min(TYPING_BASE_MS + Math.max(textLength, 0) * TYPING_MS_PER_CHAR, TYPING_MAX_MS);
}

export interface SendDelayInput {
  now: Date;
  /** The number's previous message, or null when it sent nothing recently. */
  lastSentAt: Date | null;
  /** Set for answers to the patient's own message. */
  reply: { createdAt: Date; textLength: number } | null;
  /** 0..1, injected in tests. */
  random: () => number;
}

export function sendDelayMs({ now, lastSentAt, reply, random }: SendDelayInput): number {
  const gapReady = lastSentAt ? lastSentAt.getTime() + MIN_INTERVAL_MS + random() * JITTER_MAX_MS : 0;
  const typedReady = reply ? reply.createdAt.getTime() + humanDelayMs(reply.textLength) : 0;
  return Math.max(0, Math.round(Math.max(gapReady, typedReady) - now.getTime()));
}
