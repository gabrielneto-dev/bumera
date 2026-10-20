import { describe, expect, it } from "vitest";
import { formatDayLong, formatTime, shiftDay, todayInClinic } from "@/lib/dates";

describe("todayInClinic", () => {
  it("returns the clinic's local calendar day", () => {
    expect(todayInClinic(new Date("2026-10-20T15:00:00.000Z"))).toBe("2026-10-20");
  });

  it("is still the previous day late in the evening local time", () => {
    expect(todayInClinic(new Date("2026-10-20T02:30:00.000Z"))).toBe("2026-10-19"); // 23:30 local
  });
});

describe("shiftDay", () => {
  it("moves across month and year boundaries", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("rejects malformed days", () => {
    expect(() => shiftDay("31/10/2026", 1)).toThrow(/date/);
  });
});

describe("formatTime", () => {
  it("shows the local time of an instant", () => {
    expect(formatTime("2026-10-20T13:00:00.000Z")).toBe("10:00");
    expect(formatTime("2026-10-21T02:30:00.000Z")).toBe("23:30");
  });
});

describe("formatDayLong", () => {
  it("writes the day in Portuguese", () => {
    expect(formatDayLong("2026-10-20")).toBe("terça-feira, 20 de outubro de 2026");
  });
});
