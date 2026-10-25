/** Sending side of the WhatsApp channel. Evolution today; the interface keeps the official API possible later. */

export interface OutgoingText {
  instance: string;
  phoneE164: string;
  text: string;
}

/** `error` is a short code, never the provider's body (it may echo the number or the text). */
export type SendResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string };

export interface WhatsappChannel {
  sendText(message: OutgoingText): Promise<SendResult>;
}

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function providerId(body: unknown): string | null {
  const id = (body as { key?: { id?: unknown } } | null)?.key?.id;
  return typeof id === "string" && id ? id : null;
}

export function createEvolutionChannel({ baseUrl, apiKey, fetch = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: EvolutionConfig): WhatsappChannel {
  return {
    async sendText({ instance, phoneE164, text }) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: apiKey },
          body: JSON.stringify({ number: phoneE164.replace(/\D/g, ""), text }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "evolution_timeout" : "evolution_unreachable" };
      }
      if (!response.ok) return { ok: false, error: `evolution_http_${response.status}` };
      const body: unknown = await response.json().catch(() => null);
      return { ok: true, providerMessageId: providerId(body) };
    },
  };
}
