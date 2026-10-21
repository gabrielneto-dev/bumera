import type { AppointmentStatus, ReminderKind } from "@/generated/prisma/client";

/** Delivery attempts per reminder (decision CTX-DEC-20261017-trigger-delivery-retries). */
export const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000] as const;

/** Wait before the next try after the given (1-based) failed attempt; null when out of attempts. */
export function retryDelayMs(failedAttempts: number): number | null {
  if (failedAttempts >= MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[failedAttempts - 1] ?? null;
}

export interface GuardInput {
  kind: ReminderKind;
  appointment: { status: AppointmentStatus; startsAt: Date; endsAt: Date };
  patient: { consentAt: Date | null; doNotContact: boolean; status: "PENDING" | "CONFIRMED" };
}

export type GuardResult = { ok: true } | { ok: false; status: "CANCELLED" | "SKIPPED"; reason: string };

/** A no-show invitation older than this is no longer useful (also enforced when planning). */
export const NO_SHOW_MAX_AGE_MS = 24 * 3_600_000;

const LIVE_STATUSES: readonly AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];

/**
 * Last check before handing a reminder to n8n: never send a stale reminder
 * (appointment cancelled, done or already started) or one the patient did not allow.
 */
export function evaluateGuard({ kind, appointment, patient }: GuardInput, now: Date): GuardResult {
  if (kind === "NO_SHOW_FOLLOWUP") {
    if (appointment.status !== "NO_SHOW") {
      return { ok: false, status: "CANCELLED", reason: "appointment is no longer a no-show" };
    }
    if (now.getTime() - appointment.endsAt.getTime() > NO_SHOW_MAX_AGE_MS) {
      return { ok: false, status: "CANCELLED", reason: "no-show follow-up is too old" };
    }
  } else {
    if (!LIVE_STATUSES.includes(appointment.status)) {
      return { ok: false, status: "CANCELLED", reason: `appointment is ${appointment.status}` };
    }
    if (appointment.startsAt <= now) {
      return { ok: false, status: "CANCELLED", reason: "appointment already started" };
    }
  }
  if (patient.status !== "CONFIRMED") return { ok: false, status: "SKIPPED", reason: "patient not confirmed yet" };
  if (patient.doNotContact) return { ok: false, status: "SKIPPED", reason: "patient opted out" };
  if (!patient.consentAt) return { ok: false, status: "SKIPPED", reason: "no recorded consent" };
  return { ok: true };
}
