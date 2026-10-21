import type { AppointmentStatus, ReminderKind } from "@/generated/prisma/client";
import { addMonths } from "date-fns";
import { NO_SHOW_MAX_AGE_MS, QUOTE_VALID_DAYS } from "@/lib/reminders/guard";

const HOUR_MS = 3_600_000;
/** Default timings (decision CTX-DEC-20261017-default-trigger-timings). */
const REMINDER_24H_BEFORE_MS = 24 * HOUR_MS;
const REMINDER_2H_BEFORE_MS = 2 * HOUR_MS;
const NO_SHOW_AFTER_END_MS = HOUR_MS;

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
}

/** Reminders that should exist (unsent) for an appointment right now. */
export function planReminders({ status, startsAt, endsAt, now, reactivateAfterMonths }: PlanInput): PlannedReminder[] {
  if (status === "COMPLETED") {
    return reactivateAfterMonths ? [{ kind: "REACTIVATION", dueAt: addMonths(endsAt, reactivateAfterMonths) }] : [];
  }
  if (status === "NO_SHOW") {
    const dueAt = new Date(Math.max(endsAt.getTime() + NO_SHOW_AFTER_END_MS, now.getTime()));
    const tooOld = now.getTime() - endsAt.getTime() > NO_SHOW_MAX_AGE_MS;
    return tooOld ? [] : [{ kind: "NO_SHOW_FOLLOWUP", dueAt }];
  }
  if (status !== "SCHEDULED" && status !== "CONFIRMED") return [];
  if (startsAt <= now) return [];

  const planned: PlannedReminder[] = [];
  if (status === "SCHEDULED") {
    planned.push({ kind: "CONFIRMATION", dueAt: now });
    const dueAt = new Date(startsAt.getTime() - REMINDER_24H_BEFORE_MS);
    if (dueAt >= now) planned.push({ kind: "REMINDER_24H", dueAt });
  }
  const dueAt = new Date(startsAt.getTime() - REMINDER_2H_BEFORE_MS);
  if (dueAt >= now) planned.push({ kind: "REMINDER_2H", dueAt });
  return planned;
}

const QUOTE_FOLLOWUP_1_AFTER_MS = 2 * 24 * HOUR_MS;
const QUOTE_FOLLOWUP_2_AFTER_MS = 7 * 24 * HOUR_MS;
export { QUOTE_VALID_DAYS };
const QUOTE_VALID_MS = QUOTE_VALID_DAYS * 24 * HOUR_MS;

export interface QuotePlanInput {
  status: "OPEN" | "ACCEPTED" | "DECLINED";
  createdAt: Date;
  now: Date;
}

/** Follow-ups that should exist for a quote right now (module 2): day 2 and day 7, while it is open and valid. */
export function planQuoteReminders({ status, createdAt, now }: QuotePlanInput): PlannedReminder[] {
  if (status !== "OPEN" || now.getTime() - createdAt.getTime() > QUOTE_VALID_MS) return [];
  const steps: Array<[ReminderKind, number]> = [
    ["QUOTE_FOLLOWUP_1", QUOTE_FOLLOWUP_1_AFTER_MS],
    ["QUOTE_FOLLOWUP_2", QUOTE_FOLLOWUP_2_AFTER_MS],
  ];
  return steps
    .map(([kind, after]) => ({ kind, dueAt: new Date(createdAt.getTime() + after) }))
    .filter((item) => item.dueAt >= now);
}
