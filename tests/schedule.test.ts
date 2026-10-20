import { describe, expect, it } from "vitest";
import { listFreeSlots, zonedDayRange } from "@/lib/schedule";

const TZ = "America/Sao_Paulo";
const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe("zonedDayRange", () => {
  it("returns the UTC instants of the clinic's local day", () => {
    const { start, end } = zonedDayRange("2026-10-20", TZ);
    expect(start.toISOString()).toBe("2026-10-20T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });

  it("rejects malformed dates", () => {
    expect(() => zonedDayRange("20/10/2026", TZ)).toThrow(/date/);
  });
});

describe("listFreeSlots", () => {
  const base = {
    day: "2026-10-20", // Tuesday
    timeZone: TZ,
    workStart: "08:00",
    workEnd: "12:00",
    workDays: [1, 2, 3, 4, 5, 6],
    durationMin: 60,
    stepMin: 30,
    busy: [],
  };

  it("lists every slot that fits inside working hours", () => {
    const slots = listFreeSlots(base);
    expect(slots).toHaveLength(7);
    expect(slots[0]?.toISOString()).toBe("2026-10-20T11:00:00.000Z"); // 08:00 local
    expect(slots.at(-1)?.toISOString()).toBe("2026-10-20T14:00:00.000Z"); // 11:00 local
  });

  it("removes slots that overlap busy intervals (end is exclusive)", () => {
    const slots = listFreeSlots({
      ...base,
      busy: [
        {
          startsAt: new Date("2026-10-20T12:00:00.000Z"), // 09:00 local
          endsAt: new Date("2026-10-20T13:00:00.000Z"), // 10:00 local
        },
      ],
    });
    expect(iso(slots)).toEqual([
      "2026-10-20T11:00:00.000Z", // 08:00
      "2026-10-20T13:00:00.000Z", // 10:00 (touches the busy end, allowed)
      "2026-10-20T13:30:00.000Z",
      "2026-10-20T14:00:00.000Z",
    ]);
  });

  it("returns nothing on a non-working weekday", () => {
    expect(listFreeSlots({ ...base, day: "2026-10-18" })).toEqual([]); // Sunday
  });

  it("drops slots already in the past", () => {
    const slots = listFreeSlots({ ...base, now: new Date("2026-10-20T13:10:00.000Z") });
    expect(slots[0]?.toISOString()).toBe("2026-10-20T13:30:00.000Z");
  });

  it("returns nothing when the procedure is longer than the working window", () => {
    expect(listFreeSlots({ ...base, durationMin: 300 })).toEqual([]);
  });
});
