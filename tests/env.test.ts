import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/bumera_dev",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
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
    const rest = { BETTER_AUTH_SECRET: validEnv.BETTER_AUTH_SECRET, BETTER_AUTH_URL: validEnv.BETTER_AUTH_URL };
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when the base url is not a url", () => {
    expect(() => parseEnv({ ...validEnv, BETTER_AUTH_URL: "nope" })).toThrow(/BETTER_AUTH_URL/);
  });
});
