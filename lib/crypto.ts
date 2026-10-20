import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const FORMAT_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

/** Keys live in environment variables as base64 of exactly 32 random bytes. */
export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`Key must be ${KEY_BYTES} bytes (base64-encoded)`);
  }
  return key;
}

/** AES-256-GCM; output is "v1:iv:tag:ciphertext" (base64url parts). Random IV per call. */
export function encryptField(plain: string, keyBase64: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, parseKey(keyBase64), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    FORMAT_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

/** Throws when the key is wrong or the payload was altered (GCM authentication). */
export function decryptField(payload: string, keyBase64: string): string {
  const [version, iv, tag, encrypted] = payload.split(":");
  if (version !== FORMAT_VERSION || !iv || !tag || encrypted === undefined) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv(ALGORITHM, parseKey(keyBase64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Keyed hash (HMAC-SHA256, hex) for equality lookups without storing the value. */
export function hashField(value: string, keyBase64: string): string {
  return createHmac("sha256", parseKey(keyBase64)).update(value).digest("hex");
}
