import { createOpenRouterClient } from "@/lib/ai/openrouter";
import type { AiClient } from "@/lib/ai/types";

const MIN_KEY_LENGTH = 20;

/** Whether the server has what the assistant needs (key and model). The clinic's own opt-in is separate. */
export function isAiConfigured(): boolean {
  return getAiClient() !== null;
}

/**
 * The AI client, or null when the server has no key and model configured: without them the assistant does
 * not exist and every free-text message simply goes to the secretary. Read on every call.
 */
export function getAiClient(): AiClient | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || apiKey.length < MIN_KEY_LENGTH || !model) return null;
  return createOpenRouterClient({ apiKey, model });
}
