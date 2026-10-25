import { describe, expect, it } from "vitest";
import { turnStartAfter } from "@/lib/inbound/debounce";

const now = new Date("2026-10-25T12:00:00.000Z");
const plus = (ms: number) => new Date(now.getTime() + ms);

describe("turnStartAfter", () => {
  it("waits the base window after a single message", () => {
    expect(turnStartAfter({ now, unseenCount: 1, firstUnseenAt: now })).toEqual(plus(6000));
  });

  it("waits longer for each extra message of a burst, up to the cap", () => {
    expect(turnStartAfter({ now, unseenCount: 3, firstUnseenAt: now })).toEqual(plus(10_000));
    expect(turnStartAfter({ now, unseenCount: 50, firstUnseenAt: now })).toEqual(plus(20_000));
  });

  it("never waits more than the limit counted from the first unanswered message", () => {
    const firstUnseenAt = new Date(now.getTime() - 40_000);
    expect(turnStartAfter({ now, unseenCount: 9, firstUnseenAt })).toEqual(plus(5000));
    const older = new Date(now.getTime() - 90_000);
    expect(turnStartAfter({ now, unseenCount: 9, firstUnseenAt: older })).toEqual(now);
  });
});
