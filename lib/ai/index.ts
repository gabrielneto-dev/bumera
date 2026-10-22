import { createOpenRouterClient } from "@/lib/ai/openrouter";
import type { AiClient } from "@/lib/ai/types";
import { decryptField } from "@/lib/crypto";

const MIN_KEY_LENGTH = 20;

/** The model used unless the server sets AI_MODEL: chosen by measuring candidates on Portuguese patient messages. */
export const DEFAULT_AI_MODEL = "openai/gpt-4o-mini";

/** A key shared by the whole server (optional). A clinic's own key takes precedence over it. */
function serverKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY;
  return key && key.length >= MIN_KEY_LENGTH ? key : null;
}

/** Whether an AI could answer for a clinic: it has its own saved key, or the server has one. */
export function hasAiKey(clinicHasKey: boolean): boolean {
  return clinicHasKey || serverKey() !== null;
}

/**
 * The AI client for one clinic, or null when there is no usable key: then the assistant does not exist for it
 * and every free-text message goes to the secretary. A stored key that cannot be decrypted counts as missing.
 */
export function resolveAiClient(source: { encryptedKey: string | null; encryptionKey: string }): AiClient | null {
  let apiKey: string | null = null;
  if (source.encryptedKey) {
    try {
      apiKey = decryptField(source.encryptedKey, source.encryptionKey);
    } catch {
      return null;
    }
  } else {
    apiKey = serverKey();
  }
  if (!apiKey) return null;
  return createOpenRouterClient({ apiKey, model: process.env.AI_MODEL || DEFAULT_AI_MODEL });
}
