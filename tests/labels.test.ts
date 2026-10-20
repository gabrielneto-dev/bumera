import { describe, expect, it } from "vitest";
import { APPOINTMENT_STATUS_LABEL, describeWorkDays } from "@/lib/labels";

describe("labels", () => {
  it("has a Portuguese label for every appointment status", () => {
    expect(Object.keys(APPOINTMENT_STATUS_LABEL).sort()).toEqual(
      ["CANCELLED", "COMPLETED", "CONFIRMED", "NO_SHOW", "PENDING", "SCHEDULED"],
    );
    expect(APPOINTMENT_STATUS_LABEL.NO_SHOW).toBe("Faltou");
  });

  it("describes working days in week order", () => {
    expect(describeWorkDays([6, 1, 3])).toBe("Seg, Qua, Sáb");
    expect(describeWorkDays([])).toBe("");
  });
});
