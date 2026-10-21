import { describe, expect, it, vi } from "vitest";
import { checkServiceKey } from "@/lib/service-auth";

const KEY = "k".repeat(40);

describe("checkServiceKey", () => {
  it("accepts the right bearer key", () => {
    expect(checkServiceKey(`Bearer ${KEY}`, KEY)).toBe("ok");
  });

  it("rejects a missing or malformed header", () => {
    expect(checkServiceKey(null, KEY)).toBe("unauthorized");
    expect(checkServiceKey("", KEY)).toBe("unauthorized");
    expect(checkServiceKey(KEY, KEY)).toBe("unauthorized");
    expect(checkServiceKey(`Basic ${KEY}`, KEY)).toBe("unauthorized");
  });

  it("rejects a wrong key, including one of a different length", () => {
    expect(checkServiceKey(`Bearer ${"x".repeat(40)}`, KEY)).toBe("unauthorized");
    expect(checkServiceKey("Bearer short", KEY)).toBe("unauthorized");
  });

  it("refuses everything when no key is configured", () => {
    expect(checkServiceKey(`Bearer ${KEY}`, undefined)).toBe("unconfigured");
    expect(checkServiceKey(`Bearer ${KEY}`, "")).toBe("unconfigured");
  });
});

describe("configuredServiceKey", () => {
  it("reads the variable on every call and ignores short keys", async () => {
    const { configuredServiceKey } = await import("@/lib/service-auth");
    vi.stubEnv("SERVICE_API_KEY", KEY);
    expect(configuredServiceKey()).toBe(KEY);
    vi.stubEnv("SERVICE_API_KEY", "too-short");
    expect(configuredServiceKey()).toBeUndefined();
    vi.stubEnv("SERVICE_API_KEY", "");
    expect(configuredServiceKey()).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
