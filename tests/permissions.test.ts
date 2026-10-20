import { describe, expect, it } from "vitest";
import { admin, clinicRoles, dentist, secretary } from "@/lib/permissions";

describe("clinic roles", () => {
  it("exposes exactly the three agreed roles", () => {
    expect(Object.keys(clinicRoles).sort()).toEqual(["admin", "dentist", "secretary"]);
  });

  it("lets the admin manage patients, triggers and the team", () => {
    expect(admin.statements.patient).toContain("delete");
    expect(admin.statements.triggerRule).toContain("update");
    expect(admin.statements.invitation).toContain("create");
  });

  it("lets the secretary register patients but not delete them or edit triggers", () => {
    expect(secretary.statements.patient).toEqual(["create", "read", "update"]);
    expect(secretary.statements.appointment).toContain("cancel");
    expect(secretary.statements).not.toHaveProperty("triggerRule");
  });

  it("keeps the dentist read-mostly: no patient creation, no invitations", () => {
    expect(dentist.statements.patient).toEqual(["read"]);
    expect(dentist.statements.appointment).toContain("update");
    expect(dentist.statements).not.toHaveProperty("invitation");
  });
});
