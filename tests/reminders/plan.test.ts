import { describe, expect, it } from "vitest";
import { planReminders } from "@/lib/reminders/plan";

const HOUR = 3_600_000;
const NOW = new Date("2026-10-15T12:00:00.000Z");
const startIn = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const plan = (status: Parameters<typeof planReminders>[0]["status"], startsInHours: number, durationMin = 30) =>
  planReminders({
    status,
    startsAt: startIn(startsInHours),
    endsAt: new Date(startIn(startsInHours).getTime() + durationMin * 60_000),
    now: NOW,
  });

describe("planReminders", () => {
  it("schedules a confirmation now plus the 24h and 2h reminders for a far appointment", () => {
    expect(plan("SCHEDULED", 72)).toEqual([
      { kind: "CONFIRMATION", dueAt: NOW },
      { kind: "REMINDER_24H", dueAt: startIn(48) },
      { kind: "REMINDER_2H", dueAt: startIn(70) },
    ]);
  });

  it("skips the 24h reminder when it would already be in the past", () => {
    expect(plan("SCHEDULED", 10).map((r) => r.kind)).toEqual(["CONFIRMATION", "REMINDER_2H"]);
  });

  it("skips both timed reminders for an appointment less than 2h away", () => {
    expect(plan("SCHEDULED", 1).map((r) => r.kind)).toEqual(["CONFIRMATION"]);
  });

  it("keeps only the 2h reminder once the patient confirmed", () => {
    expect(plan("CONFIRMED", 72)).toEqual([{ kind: "REMINDER_2H", dueAt: startIn(70) }]);
  });

  it("plans nothing for pending (not yet approved) appointments", () => {
    expect(plan("PENDING", 72)).toEqual([]);
  });

  it("plans nothing for cancelled or completed appointments", () => {
    expect(plan("CANCELLED", 72)).toEqual([]);
    expect(plan("COMPLETED", 72)).toEqual([]);
  });

  it("plans nothing once the appointment has started", () => {
    expect(plan("SCHEDULED", -1)).toEqual([]);
    expect(plan("CONFIRMED", 0)).toEqual([]);
  });

  it("invites a no-show to reschedule one hour after the slot ended", () => {
    const result = plan("NO_SHOW", -2); // started 2h ago, ended 1h30 ago
    expect(result).toEqual([{ kind: "NO_SHOW_FOLLOWUP", dueAt: NOW }]); // 1h after end is already past -> due now
  });

  it("waits for the hour after the slot when the no-show is marked right away", () => {
    const result = plan("NO_SHOW", -0.25); // started 15 min ago, ends in 15 min
    expect(result).toEqual([{ kind: "NO_SHOW_FOLLOWUP", dueAt: new Date(NOW.getTime() + 0.25 * HOUR + HOUR) }]);
  });

  it("drops a no-show follow-up that is more than a day old", () => {
    expect(plan("NO_SHOW", -30)).toEqual([]);
  });
});
