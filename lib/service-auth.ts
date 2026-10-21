import { createHash, timingSafeEqual } from "node:crypto";

export type ServiceKeyCheck = "ok" | "unauthorized" | "unconfigured";

const MIN_KEY_LENGTH = 32;
const BEARER = /^Bearer (\S+)$/;

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Checks the `Authorization: Bearer <key>` header against the configured service key.
 * Both sides are hashed first so the comparison is constant-time whatever the lengths.
 */
export function checkServiceKey(header: string | null, expected: string | undefined): ServiceKeyCheck {
  if (!expected) return "unconfigured";
  const match = header ? BEARER.exec(header) : null;
  if (!match?.[1]) return "unauthorized";
  return timingSafeEqual(digest(match[1]), digest(expected)) ? "ok" : "unauthorized";
}

/**
 * The configured key, read on every call. A key shorter than the minimum counts as not configured,
 * so a typo can never open the endpoints with a guessable secret.
 */
export function configuredServiceKey(): string | undefined {
  const key = process.env.SERVICE_API_KEY;
  return key && key.length >= MIN_KEY_LENGTH ? key : undefined;
}
