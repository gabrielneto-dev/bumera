export type WhatsappSender = "worker" | "n8n";

/**
 * Who buffers inbound messages and sends WhatsApp messages (CTX-DEC-20261025-migration-roadmap): the worker
 * (`WHATSAPP_SENDER=worker`) or the legacy n8n poll of /api/v1/reminders/due (default). Never both: while the
 * worker sends, /due hands nothing out. Read on every call so a switch needs no code change.
 */
export function whatsappSender(): WhatsappSender {
  return process.env.WHATSAPP_SENDER === "worker" ? "worker" : "n8n";
}
