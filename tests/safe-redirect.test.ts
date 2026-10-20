import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("accepts in-app absolute paths", () => {
    expect(safeNextPath("/convite/abc123")).toBe("/convite/abc123");
    expect(safeNextPath("/agenda?dia=2026-10-20")).toBe("/agenda?dia=2026-10-20");
  });

  it("rejects external, protocol-relative and malformed targets", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "convite/1", "", "/a\nb"]) {
      expect(safeNextPath(value)).toBeUndefined();
    }
  });

  it("rejects non-string input", () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(["/a"])).toBeUndefined();
    expect(safeNextPath(42)).toBeUndefined();
  });
});
