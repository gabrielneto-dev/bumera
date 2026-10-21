export interface InboundMessage {
  phoneE164: string;
  text: string;
  messageId: string;
}

const BR_E164 = /^\+55\d{10,11}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const asString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** "5517997822073@s.whatsapp.net" -> "+5517997822073"; null for groups, broadcasts and foreign numbers. */
function phoneFromJid(jid: string | null): string | null {
  if (!jid?.endsWith("@s.whatsapp.net")) return null;
  const candidate = `+${jid.slice(0, jid.indexOf("@")).replace(/\D/g, "")}`;
  return BR_E164.test(candidate) ? candidate : null;
}

function textOf(message: Record<string, unknown> | null): string | null {
  if (!message) return null;
  return asString(message.conversation) ?? asString(asRecord(message.extendedTextMessage)?.text);
}

/**
 * Extracts a patient's text message from an Evolution API webhook body, or null when the event
 * is not something to act on (our own messages, groups, broadcasts, media, other events).
 */
export function parseEvolutionMessage(payload: unknown): InboundMessage | null {
  const body = asRecord(payload);
  const event = asString(body?.event)?.toLowerCase().replace(/_/g, ".");
  if (event !== "messages.upsert") return null;

  const raw = body?.data;
  const data = asRecord(Array.isArray(raw) ? raw[0] : raw);
  const key = asRecord(data?.key);
  if (!key || key.fromMe === true) return null;

  const remoteJid = asString(key.remoteJid);
  // WhatsApp may hide the number behind a @lid id and send the real one alongside.
  const phoneE164 = phoneFromJid(remoteJid) ?? phoneFromJid(asString(key.remoteJidAlt));
  const text = textOf(asRecord(data?.message));
  const messageId = asString(key.id);
  if (!phoneE164 || !text || !messageId) return null;
  return { phoneE164, text, messageId };
}

/**
 * Older WhatsApp accounts report Brazilian mobiles without the ninth digit. Returns the number
 * as given plus the variant with or without that digit, so patients are found either way.
 */
export function phoneCandidates(e164: string): string[] {
  const withNine = /^(\+55\d{2})9(\d{8})$/.exec(e164);
  if (withNine) return [e164, `${withNine[1]}${withNine[2]}`];
  const withoutNine = /^(\+55\d{2})([6-9]\d{7})$/.exec(e164);
  if (withoutNine) return [e164, `${withoutNine[1]}9${withoutNine[2]}`];
  return [e164];
}
