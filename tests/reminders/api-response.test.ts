import { afterEach, describe, expect, it, vi } from "vitest";
import { fail, failFrom, ok } from "@/lib/api-response";
import { AppError } from "@/lib/errors";

afterEach(() => vi.restoreAllMocks());

describe("api envelope", () => {
  it("wraps data and meta on success", async () => {
    const response = ok([1], { count: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [1], error: null, meta: { count: 1 } });
  });

  it("wraps an error without data", async () => {
    const response = fail(418, "TEAPOT", "nope");
    expect(response.status).toBe(418);
    expect(await response.json()).toEqual({ success: false, data: null, error: { code: "TEAPOT", message: "nope" }, meta: null });
  });

  it.each([
    ["NOT_FOUND", 404],
    ["VALIDATION", 400],
    ["SLOT_TAKEN", 409],
  ] as const)("maps AppError %s to HTTP %i", async (code, status) => {
    const response = failFrom(new AppError(code, "msg"));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("hides unexpected errors behind a generic 500 and logs them server-side", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = failFrom(new Error("connection string postgres://secret"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.error.code).toBe("INTERNAL");
    expect(log).toHaveBeenCalled();
  });
});
