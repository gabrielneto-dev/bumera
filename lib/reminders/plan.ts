import type { AppointmentStatus, ReminderKind } from "@/generated/prisma/client";
import { addMonths } from "date-fns";
import { NO_SHOW_MAX_AGE_MS, QUOTE_VALID_DAYS } from "@/lib/reminders/guard";
import { type ClinicSettings, DEFAULT_CLINIC_SETTINGS } from "@/lib/reminders/settings";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface PlannedReminder {
  kind: ReminderKind;
  dueAt: Date;
}

export interface PlanInput {
  status: AppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  now: Date;
  /** Months after completion to invite the patient back; null/undefined = no invitation. */
  reactivateAfterMonths?: number | null;
  /** The clinic's timings; the defaults when omitted. */
  settings?: ClinicSettings;
}

/** Reminders that should exist (unsent) for an appointment right now. */
export function planReminders({ status, startsAt, endsAt, now, reactivateAfterMonths, settings = DEFAULT_CLINIC_SETTINGS }: PlanInput): PlannedReminder[] {
  if (status === "COMPLETED") {
    return reactivateAfterMonths ? [{ kind: "REACTIVATION", dueAt: addMonths(endsAt, reactivateAfterMonths) }] : [];
  }
  if (status === "NO_SHOW") {
    if (!settings.noShowEnabled) return [];
    const dueAt = new Date(Math.max(endsAt.getTime() + settings.noShowDelayHours * HOUR_MS, now.getTime()));
    const tooOld = now.getTime() - endsAt.getTime() > NO_SHOW_MAX_AGE_MS;
    return tooOld ? [] : [{ kind: "NO_SHOW_FOLLOWUP", dueAt }];
  }
  if (status !== "SCHEDULED" && status !== "CONFIRMED") return [];
  if (startsAt <= now) return [];

  const planned: PlannedReminder[] = [];
  if (status === "SCHEDULED") {
    if (settings.confirmationEnabled) planned.push({ kind: "CONFIRMATION", dueAt: now });
    const dueAt = new Date(startsAt.getTime() - settings.reminder1HoursBefore * HOUR_MS);
    if (settings.reminder1Enabled && dueAt >= now) planned.push({ kind: "REMINDER_24H", dueAt });
  }
  const dueAt = new Date(startsAt.getTime() - settings.reminder2HoursBefore * HOUR_MS);
  if (settings.reminder2Enabled && dueAt >= now) planned.push({ kind: "REMINDER_2H", dueAt });
  return planned;
}

export { QUOTE_VALID_DAYS };

export interface QuotePlanInput {
  status: "OPEN" | "ACCEPTED" | "DECLINED";
  createdAt: Date;
  now: Date;
  settings?: ClinicSettings;
}

/** Follow-ups that should exist for a quote right now (module 2), while it is open and valid. */
export function planQuoteReminders({ status, createdAt, now, settings = DEFAULT_CLINIC_SETTINGS }: QuotePlanInput): PlannedReminder[] {
  if (status !== "OPEN" || now.getTime() - createdAt.getTime() > settings.quoteValidDays * DAY_MS) return [];
  const steps: Array<[ReminderKind, number]> = [
    ["QUOTE_FOLLOWUP_1", settings.quoteFollowup1Days],
    ["QUOTE_FOLLOWUP_2", settings.quoteFollowup2Days],
  ];
  return steps
    .map(([kind, days]) => ({ kind, dueAt: new Date(createdAt.getTime() + days * DAY_MS) }))
    .filter((item) => item.dueAt >= now);
}
