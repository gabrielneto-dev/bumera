import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, isNotFoundError, isOverlapViolation, isUniqueViolation } from "@/lib/db-errors";

const prismaError = (code: string, originalCode?: string) => ({
  code,
  meta: originalCode ? { driverAdapterError: { cause: { originalCode } } } : {},
});

describe("db error classification", () => {
  it("recognizes unique violations", () => {
    expect(isUniqueViolation(prismaError("P2002", "23505"))).toBe(true);
    expect(isUniqueViolation(prismaError("P2025"))).toBe(false);
  });

  it("recognizes the overlap (exclusion constraint) violation", () => {
    expect(isOverlapViolation(prismaError("P2039", "23P01"))).toBe(true);
    expect(isOverlapViolation(prismaError("P2002", "23505"))).toBe(false);
  });

  it("recognizes foreign key and not-found errors", () => {
    expect(isForeignKeyViolation(prismaError("P2003"))).toBe(true);
    expect(isForeignKeyViolation(prismaError("P2039", "23503"))).toBe(true);
    expect(isNotFoundError(prismaError("P2025"))).toBe(true);
  });

  it("is safe with non-error values", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isOverlapViolation("boom")).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});
