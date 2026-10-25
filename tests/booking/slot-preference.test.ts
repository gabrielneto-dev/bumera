import { describe, expect, it } from "vitest";
import { matchesPreference } from "@/lib/booking/slots";

// 2026-10-26 is a Monday; Brasília is UTC-3.
const MONDAY = "2026-10-26";
const at = (hour: number): string => new Date(Date.UTC(2026, 9, 26, hour + 3)).toISOString();

describe("matchesPreference", () => {
  it("accepts everything when nothing was asked", () => {
    expect(matchesPreference(at(9), MONDAY, null)).toBe(true);
    expect(matchesPreference(at(9), MONDAY, undefined)).toBe(true);
  });

  it("filters by period", () => {
    expect(matchesPreference(at(9), MONDAY, { period: "morning" })).toBe(true);
    expect(matchesPreference(at(14), MONDAY, { period: "morning" })).toBe(false);
    expect(matchesPreference(at(14), MONDAY, { period: "afternoon" })).toBe(true);
    expect(matchesPreference(at(9), MONDAY, { period: "afternoon" })).toBe(false);
  });

  it("filters by weekday (0 = Sunday)", () => {
    expect(matchesPreference(at(9), MONDAY, { weekdays: [1, 3] })).toBe(true);
    expect(matchesPreference(at(9), MONDAY, { weekdays: [2, 4] })).toBe(false);
  });

  it("filters by earliest hour", () => {
    expect(matchesPreference(at(16), MONDAY, { fromHour: 16 })).toBe(true);
    expect(matchesPreference(at(15), MONDAY, { fromHour: 16 })).toBe(false);
  });

  it("combines every condition", () => {
    const wanted = { weekdays: [1], period: "afternoon" as const, fromHour: 15 };
    expect(matchesPreference(at(15), MONDAY, wanted)).toBe(true);
    expect(matchesPreference(at(14), MONDAY, wanted)).toBe(false);
  });
});
