import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const key = Buffer.alloc(32, 7).toString("base64");

const validEnv = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/bumera_dev",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  CPF_ENCRYPTION_KEY: key,
  CPF_HASH_KEY: key,
};

describe("parseEnv", () => {
  it("returns typed values and defaults NODE_ENV to development", () => {
    const env = parseEnv(validEnv);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.NODE_ENV).toBe("development");
  });

  it("throws a readable error when the auth secret is too short", () => {
    expect(() => parseEnv({ ...validEnv, BETTER_AUTH_SECRET: "short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("throws when a required variable is missing", () => {
    const { DATABASE_URL, ...rest } = validEnv;
    expect(DATABASE_URL).toBeDefined();
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when the base url is not a url", () => {
    expect(() => parseEnv({ ...validEnv, BETTER_AUTH_URL: "nope" })).toThrow(/BETTER_AUTH_URL/);
  });

  it("requires the CPF keys to be 32 bytes in base64", () => {
    expect(() => parseEnv({ ...validEnv, CPF_ENCRYPTION_KEY: "short" })).toThrow(/CPF_ENCRYPTION_KEY/);
    expect(() => parseEnv({ ...validEnv, CPF_HASH_KEY: "" })).toThrow(/CPF_HASH_KEY/);
  });
});
