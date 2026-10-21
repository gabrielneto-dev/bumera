import { describe, expect, it } from "vitest";
import { evaluateGuard, MAX_ATTEMPTS, retryDelayMs } from "@/lib/reminders/guard";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const base = {
  kind: "REMINDER_24H" as const,
  appointment: {
    status: "SCHEDULED" as const,
    startsAt: new Date("2026-10-16T12:00:00.000Z"),
    endsAt: new Date("2026-10-16T12:30:00.000Z"),
  },
  patient: { consentAt: new Date("2026-10-01T00:00:00.000Z"), doNotContact: false, status: "CONFIRMED" as const },
};

describe("evaluateGuard", () => {
  it("lets a valid reminder through", () => {
    expect(evaluateGuard(base, NOW)).toEqual({ ok: true });
  });

  it.each(["CANCELLED", "COMPLETED", "NO_SHOW", "PENDING"] as const)(
    "cancels a reminder for a %s appointment",
    (status) => {
      const result = evaluateGuard({ ...base, appointment: { ...base.appointment, status } }, NOW);
      expect(result).toMatchObject({ ok: false, status: "CANCELLED" });
    },
  );

  it("cancels a reminder whose appointment already started", () => {
    const started = { ...base.appointment, startsAt: new Date("2026-10-15T11:59:00.000Z") };
    expect(evaluateGuard({ ...base, appointment: started }, NOW)).toMatchObject({ ok: false, status: "CANCELLED" });
  });

  it("skips patients who opted out", () => {
    const result = evaluateGuard({ ...base, patient: { ...base.patient, doNotContact: true } }, NOW);
    expect(result).toMatchObject({ ok: false, status: "SKIPPED" });
  });

  it("skips patients without recorded consent", () => {
    const result = evaluateGuard({ ...base, patient: { ...base.patient, consentAt: null } }, NOW);
    expect(result).toMatchObject({ ok: false, status: "SKIPPED" });
  });

  it("lets a no-show follow-up through even though the appointment is in the past", () => {
    const noShow = {
      kind: "NO_SHOW_FOLLOWUP" as const,
      appointment: { status: "NO_SHOW" as const, startsAt: new Date("2026-10-15T09:00:00.000Z"), endsAt: new Date("2026-10-15T09:30:00.000Z") },
      patient: base.patient,
    };
    expect(evaluateGuard(noShow, NOW)).toEqual({ ok: true });
  });

  it("drops a no-show follow-up older than a day", () => {
    const old = {
      kind: "NO_SHOW_FOLLOWUP" as const,
      appointment: { status: "NO_SHOW" as const, startsAt: new Date("2026-10-14T09:00:00.000Z"), endsAt: new Date("2026-10-14T09:30:00.000Z") },
      patient: base.patient,
    };
    expect(evaluateGuard(old, NOW)).toMatchObject({ ok: false, status: "CANCELLED" });
  });

  it("skips patients whose registration is still pending", () => {
    const result = evaluateGuard({ ...base, patient: { ...base.patient, status: "PENDING" } }, NOW);
    expect(result).toMatchObject({ ok: false, status: "SKIPPED" });
  });

  it("rejects a no-show follow-up for an appointment that is not a no-show", () => {
    const wrong = {
      kind: "NO_SHOW_FOLLOWUP" as const,
      appointment: { status: "COMPLETED" as const, startsAt: new Date("2026-10-15T09:00:00.000Z"), endsAt: new Date("2026-10-15T09:30:00.000Z") },
      patient: base.patient,
    };
    expect(evaluateGuard(wrong, NOW)).toMatchObject({ ok: false, status: "CANCELLED" });
  });
});

describe("retryDelayMs", () => {
  it("grows with each failed attempt", () => {
    const delays = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, i) => retryDelayMs(i + 1));
    expect(delays).toEqual([60_000, 300_000, 1_800_000, 7_200_000]);
  });

  it("returns null once the attempts are used up", () => {
    expect(retryDelayMs(MAX_ATTEMPTS)).toBeNull();
    expect(retryDelayMs(MAX_ATTEMPTS + 1)).toBeNull();
  });
});
