import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, hashField, parseKey } from "@/lib/crypto";

const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("base64");

describe("parseKey", () => {
  it("accepts a base64 key of 32 bytes", () => {
    expect(parseKey(keyA)).toHaveLength(32);
  });

  it("rejects keys of the wrong size", () => {
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => parseKey("")).toThrow(/32 bytes/);
  });
});

describe("encryptField / decryptField", () => {
  it("round-trips a value", () => {
    const encrypted = encryptField("52998224725", keyA);
    expect(encrypted).not.toContain("52998224725");
    expect(decryptField(encrypted, keyA)).toBe("52998224725");
  });

  it("uses a fresh IV, so equal inputs give different ciphertexts", () => {
    expect(encryptField("x", keyA)).not.toBe(encryptField("x", keyA));
  });

  it("fails with the wrong key or tampered data", () => {
    const encrypted = encryptField("secret", keyA);
    expect(() => decryptField(encrypted, keyB)).toThrow();
    const parts = encrypted.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptField(parts.join(":"), keyA)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptField("nope", keyA)).toThrow(/payload/);
  });
});

describe("hashField", () => {
  it("is deterministic and depends on the key", () => {
    expect(hashField("52998224725", keyA)).toBe(hashField("52998224725", keyA));
    expect(hashField("52998224725", keyA)).not.toBe(hashField("52998224725", keyB));
  });

  it("differs for different values and does not reveal the value", () => {
    const hash = hashField("52998224725", keyA);
    expect(hash).not.toBe(hashField("52998224726", keyA));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
