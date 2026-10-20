import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { assertCan, can, parseRoles } from "@/lib/authz";

describe("parseRoles", () => {
  it("splits comma-separated roles and drops unknown ones", () => {
    expect(parseRoles("secretary,dentist")).toEqual(["secretary", "dentist"]);
    expect(parseRoles("member")).toEqual([]);
    expect(parseRoles("")).toEqual([]);
  });
});

describe("can", () => {
  it("lets the admin do everything on the registry", () => {
    expect(can("admin", "patient", "delete")).toBe(true);
    expect(can("admin", "dentist", "create")).toBe(true);
  });

  it("lets the secretary register patients and book, but not delete or manage dentists", () => {
    expect(can("secretary", "patient", "create")).toBe(true);
    expect(can("secretary", "appointment", "cancel")).toBe(true);
    expect(can("secretary", "patient", "delete")).toBe(false);
    expect(can("secretary", "dentist", "create")).toBe(false);
  });

  it("lets only the admin manage the team", () => {
    expect(can("admin", "invitation", "create")).toBe(true);
    expect(can("admin", "invitation", "cancel")).toBe(true);
    expect(can("admin", "member", "delete")).toBe(true);
    for (const role of ["secretary", "dentist"]) {
      expect(can(role, "invitation", "create")).toBe(false);
      expect(can(role, "member", "delete")).toBe(false);
    }
  });

  it("keeps the dentist read-mostly", () => {
    expect(can("dentist", "patient", "read")).toBe(true);
    expect(can("dentist", "patient", "create")).toBe(false);
    expect(can("dentist", "appointment", "update")).toBe(true);
    expect(can("dentist", "appointment", "cancel")).toBe(false);
  });

  it("denies unknown roles, resources and actions", () => {
    expect(can("member", "patient", "read")).toBe(false);
    expect(can("admin", "nothing", "read")).toBe(false);
    expect(can("admin", "patient", "explode")).toBe(false);
  });

  it("combines several roles", () => {
    expect(can("dentist,secretary", "patient", "create")).toBe(true);
  });
});

describe("assertCan", () => {
  it("throws a FORBIDDEN AppError when the role lacks the permission", () => {
    expect(() => assertCan("dentist", "patient", "create")).toThrow(AppError);
    try {
      assertCan("dentist", "patient", "create");
    } catch (error) {
      expect((error as AppError).code).toBe("FORBIDDEN");
    }
  });

  it("does nothing when allowed", () => {
    expect(() => assertCan("secretary", "patient", "create")).not.toThrow();
  });
});
