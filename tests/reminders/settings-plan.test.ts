import { describe, expect, it } from "vitest";
import { evaluateQuoteGuard } from "@/lib/reminders/guard";
import { renderReminderMessage } from "@/lib/reminders/messages";
import { planQuoteReminders, planReminders } from "@/lib/reminders/plan";
import { DEFAULT_CLINIC_SETTINGS, type ClinicSettings } from "@/lib/reminders/settings";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-15T12:00:00.000Z");
const STARTS = new Date(NOW.getTime() + 5 * DAY);
const ENDS = new Date(STARTS.getTime() + 30 * 60_000);
const settings = (override: Partial<ClinicSettings>): ClinicSettings => ({ ...DEFAULT_CLINIC_SETTINGS, ...override });
const plan = (override: Partial<ClinicSettings>, status: "SCHEDULED" | "CONFIRMED" | "NO_SHOW" = "SCHEDULED") =>
  planReminders({ status, startsAt: STARTS, endsAt: ENDS, now: NOW, settings: settings(override) });

describe("defaults", () => {
  it("match the timings the pilot started with", () => {
    expect(DEFAULT_CLINIC_SETTINGS).toEqual({
      confirmationEnabled: true,
      reminder1Enabled: true,
      reminder1HoursBefore: 24,
      reminder2Enabled: true,
      reminder2HoursBefore: 2,
      noShowEnabled: true,
      noShowDelayHours: 1,
      quoteFollowup1Days: 2,
      quoteFollowup2Days: 7,
      quoteValidDays: 14,
      quietEnabled: true,
      quietStartHour: 21,
      quietEndHour: 8,
      dailySendLimit: 150,
    });
  });

  it("planning without settings behaves like the defaults", () => {
    expect(planReminders({ status: "SCHEDULED", startsAt: STARTS, endsAt: ENDS, now: NOW })).toEqual(plan({}));
  });
});

describe("planReminders with clinic settings", () => {
  it("uses the configured hours before the appointment", () => {
    const planned = plan({ reminder1HoursBefore: 48, reminder2HoursBefore: 4 });
    expect(planned.find((item) => item.kind === "REMINDER_24H")?.dueAt).toEqual(new Date(STARTS.getTime() - 48 * HOUR));
    expect(planned.find((item) => item.kind === "REMINDER_2H")?.dueAt).toEqual(new Date(STARTS.getTime() - 4 * HOUR));
  });

  it("leaves out what the clinic switched off", () => {
    expect(plan({ confirmationEnabled: false }).map((item) => item.kind)).toEqual(["REMINDER_24H", "REMINDER_2H"]);
    expect(plan({ reminder1Enabled: false }).map((item) => item.kind)).toEqual(["CONFIRMATION", "REMINDER_2H"]);
    expect(plan({ reminder2Enabled: false }).map((item) => item.kind)).toEqual(["CONFIRMATION", "REMINDER_24H"]);
  });

  it("still asks only unconfirmed patients for the first reminder", () => {
    expect(plan({}, "CONFIRMED").map((item) => item.kind)).toEqual(["REMINDER_2H"]);
  });

  it("drops a reminder whose moment already passed", () => {
    const soon = planReminders({ status: "SCHEDULED", startsAt: new Date(NOW.getTime() + 3 * HOUR), endsAt: ENDS, now: NOW, settings: settings({ reminder2HoursBefore: 6 }) });
    expect(soon.map((item) => item.kind)).toEqual(["CONFIRMATION"]);
  });

  it("uses the configured delay and switch for the no-show invitation", () => {
    const delayed = plan({ noShowDelayHours: 3 }, "NO_SHOW");
    expect(delayed).toEqual([{ kind: "NO_SHOW_FOLLOWUP", dueAt: new Date(ENDS.getTime() + 3 * HOUR) }]);
    expect(plan({ noShowEnabled: false }, "NO_SHOW")).toEqual([]);
  });
});

describe("quotes with clinic settings", () => {
  const created = NOW;

  it("uses the configured follow-up days", () => {
    const planned = planQuoteReminders({ status: "OPEN", createdAt: created, now: created, settings: settings({ quoteFollowup1Days: 1, quoteFollowup2Days: 4 }) });
    expect(planned).toEqual([
      { kind: "QUOTE_FOLLOWUP_1", dueAt: new Date(created.getTime() + DAY) },
      { kind: "QUOTE_FOLLOWUP_2", dueAt: new Date(created.getTime() + 4 * DAY) },
    ]);
  });

  it("stops planning once the configured validity ended", () => {
    const later = new Date(created.getTime() + 6 * DAY);
    const tight = settings({ quoteValidDays: 5 });
    expect(planQuoteReminders({ status: "OPEN", createdAt: created, now: later, settings: tight })).toEqual([]);
  });

  it("the guard honours the configured validity", () => {
    const patient = { consentAt: new Date("2026-10-01T00:00:00.000Z"), doNotContact: false, status: "CONFIRMED" as const };
    const quote = { status: "OPEN" as const, createdAt: created };
    const day10 = new Date(created.getTime() + 10 * DAY);
    expect(evaluateQuoteGuard({ quote, patient }, day10)).toEqual({ ok: true });
    expect(evaluateQuoteGuard({ quote, patient }, day10, 7)).toMatchObject({ ok: false, status: "CANCELLED" });
  });
});

describe("reminder wording does not assume the configured time", () => {
  const base = { clinicName: "Odonto Company", patientName: "Maria Souza", startsAt: "2026-10-20T13:00:00.000Z", dentistName: "Dr. Teste", procedureName: "Limpeza" };

  it("keeps the real date and time in the text instead of saying 'amanhã' or 'hoje'", () => {
    const first = renderReminderMessage({ ...base, kind: "REMINDER_24H" });
    const second = renderReminderMessage({ ...base, kind: "REMINDER_2H" });
    for (const text of [first, second]) {
      expect(text).not.toMatch(/amanhã|hoje/i);
      expect(text).toContain("terça-feira, 20/10 às 10:00");
    }
    expect(first).toContain("*1* para confirmar");
    expect(second).not.toContain("*1*");
  });
});
