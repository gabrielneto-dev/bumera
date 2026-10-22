export type ConnectionState = "open" | "connecting" | "closed" | "unknown" | "unconfigured";

const TIMEOUT_MS = 3_000;
const KNOWN_STATES: Record<string, ConnectionState> = { open: "open", connecting: "connecting", close: "closed" };

/**
 * Asks the Evolution API whether a clinic's WhatsApp instance is connected, for the status shown on screen.
 * Messages themselves are sent by n8n; this is read-only and never throws: any failure is "unknown".
 */
export async function getConnectionState(instance: string): Promise<ConnectionState> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) return "unconfigured";
  try {
    const response = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "unknown";
    const body: unknown = await response.json();
    const state = (body as { instance?: { state?: unknown } } | null)?.instance?.state;
    return typeof state === "string" ? (KNOWN_STATES[state] ?? "unknown") : "unknown";
  } catch {
    return "unknown";
  }
}
