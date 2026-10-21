import { describe, expect, it } from "vitest";
import { isQuietNow, nextDayWindowStart, nextQuietEnd, startOfLocalDay } from "@/lib/reminders/send-window";

// Sao Paulo is UTC-3 all year, so local 22:00 is 01:00Z of the next day.
const at = (iso: string) => new Date(iso);
const night = { quietEnabled: true, quietStartHour: 21, quietEndHour: 8 };

describe("isQuietNow", () => {
  it.each([
    ["2026-10-16T00:00:00.000Z", true], // 21:00 local: starts
    ["2026-10-16T01:00:00.000Z", true], // 22:00
    ["2026-10-16T05:59:00.000Z", true], // 02:59
    ["2026-10-16T10:59:00.000Z", true], // 07:59
    ["2026-10-16T11:00:00.000Z", false], // 08:00: ends
    ["2026-10-16T15:00:00.000Z", false], // 12:00
    ["2026-10-16T23:59:00.000Z", false], // 20:59
  ])("with the default overnight window, %s is quiet: %s", (iso, expected) => {
    expect(isQuietNow(at(iso), night)).toBe(expected);
  });

  it("supports a window that does not cross midnight", () => {
    const early = { quietEnabled: true, quietStartHour: 1, quietEndHour: 5 };
    expect(isQuietNow(at("2026-10-16T06:00:00.000Z"), early)).toBe(true); // 03:00
    expect(isQuietNow(at("2026-10-16T08:00:00.000Z"), early)).toBe(false); // 05:00
    expect(isQuietNow(at("2026-10-16T02:00:00.000Z"), early)).toBe(false); // 23:00
  });

  it("is never quiet when switched off", () => {
    expect(isQuietNow(at("2026-10-16T05:00:00.000Z"), { ...night, quietEnabled: false })).toBe(false);
  });
});

describe("nextQuietEnd", () => {
  it("finds the next 08:00 after a late evening", () => {
    expect(nextQuietEnd(at("2026-10-16T02:00:00.000Z"), night)).toEqual(at("2026-10-16T11:00:00.000Z"));
  });

  it("finds the same morning's 08:00 after midnight", () => {
    expect(nextQuietEnd(at("2026-10-16T06:00:00.000Z"), night)).toEqual(at("2026-10-16T11:00:00.000Z"));
  });

  it("is strictly after now, so a quiet end is never returned as the present", () => {
    expect(nextQuietEnd(at("2026-10-16T11:00:00.000Z"), night)).toEqual(at("2026-10-17T11:00:00.000Z"));
  });
});

describe("startOfLocalDay and nextDayWindowStart", () => {
  const now = at("2026-10-15T12:00:00.000Z"); // 09:00 local

  it("starts the day at local midnight", () => {
    expect(startOfLocalDay(now)).toEqual(at("2026-10-15T03:00:00.000Z"));
  });

  it("opens the next sending window when the quiet period ends tomorrow morning", () => {
    expect(nextDayWindowStart(now, night)).toEqual(at("2026-10-16T11:00:00.000Z"));
  });

  it("opens at local midnight when there is no quiet period", () => {
    expect(nextDayWindowStart(now, { ...night, quietEnabled: false })).toEqual(at("2026-10-16T03:00:00.000Z"));
  });

  it("opens at local midnight when the quiet period does not cover it", () => {
    expect(nextDayWindowStart(now, { quietEnabled: true, quietStartHour: 1, quietEndHour: 5 })).toEqual(at("2026-10-16T03:00:00.000Z"));
  });
});
