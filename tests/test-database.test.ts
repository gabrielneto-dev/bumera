import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl } from "./helpers/test-database";

describe("assertTestDatabaseUrl", () => {
  it("accepts a database whose name ends with _test", () => {
    const url = "postgresql://u:p@127.0.0.1:5433/bumera_test";
    expect(assertTestDatabaseUrl(url)).toBe(url);
  });

  it("rejects a dev or production database name", () => {
    expect(() => assertTestDatabaseUrl("postgresql://u:p@h:5432/bumera_dev")).toThrow(/Refusing/);
    expect(() => assertTestDatabaseUrl("postgresql://u:p@h:5432/bumera_prod")).toThrow(/Refusing/);
  });

  it("rejects a missing or malformed url", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/not set/);
    expect(() => assertTestDatabaseUrl("not a url")).toThrow(/valid URL/);
  });
});
