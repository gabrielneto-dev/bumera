import { createHash, timingSafeEqual } from "node:crypto";

const MIN_TOKEN_LENGTH = 32;
const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time check of the secret embedded in the webhook URL. */
export function checkWebhookToken(token: string, expected: string | undefined): "ok" | "unauthorized" | "unconfigured" {
  if (!expected) return "unconfigured";
  return timingSafeEqual(digest(token), digest(expected)) ? "ok" : "unauthorized";
}

/** The configured token, read on every call; a short one counts as not configured. */
export function configuredWebhookToken(): string | undefined {
  const token = process.env.EVOLUTION_WEBHOOK_TOKEN;
  return token && token.length >= MIN_TOKEN_LENGTH ? token : undefined;
}
