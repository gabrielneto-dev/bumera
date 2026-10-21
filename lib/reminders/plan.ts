import type { AppointmentStatus, ReminderKind } from "@/generated/prisma/client";
import { NO_SHOW_MAX_AGE_MS } from "@/lib/reminders/guard";

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
}

/** Reminders that should exist (unsent) for an appointment right now. */
export function planReminders({ status, startsAt, endsAt, now }: PlanInput): PlannedReminder[] {
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
