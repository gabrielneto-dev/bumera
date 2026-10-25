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
  /** Absent only for replies about a quote; every other kind needs it. */
  appointment?: { status: AppointmentStatus; startsAt: Date; endsAt: Date };
  patient: { consentAt: Date | null; doNotContact: boolean; status: "PENDING" | "CONFIRMED" };
  /** For reactivation: the patient already has a live appointment ahead, so the invitation is moot. */
  patientHasUpcomingAppointment?: boolean;
}

const REPLY_KINDS: readonly ReminderKind[] = ["REPLY_CONFIRMED", "REPLY_RESCHEDULE", "REPLY_OPTED_OUT", "REPLY_INTERESTED", "REPLY_DECLINED", "REPLY_HANDOFF", "REPLY_AI", "REPLY_FLOW", "REPLY_MEDIA"];

/** Answers to a patient's own WhatsApp message (as opposed to reminders the clinic starts). */
export function isReplyKind(kind: ReminderKind): boolean {
  return REPLY_KINDS.includes(kind);
}

export type GuardResult = { ok: true } | { ok: false; status: "CANCELLED" | "SKIPPED"; reason: string };

/** A no-show invitation older than this is no longer useful (also enforced when planning). */
/** A quote older than this is considered expired: no more follow-ups. */
export const QUOTE_VALID_DAYS = 14;

export const NO_SHOW_MAX_AGE_MS = 24 * 3_600_000;

const LIVE_STATUSES: readonly AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];

/**
 * Last check before handing a reminder to n8n: never send a stale reminder
 * (appointment cancelled, done or already started) or one the patient did not allow.
 */
export function evaluateGuard({ kind, appointment, patient, patientHasUpcomingAppointment }: GuardInput, now: Date): GuardResult {
  if (isReplyKind(kind)) {
    // The patient just wrote to us: no schedule or consent checks. The opt-out acknowledgement is
    // the one message still allowed after the opt-out; every other reply stops once they opted out.
    if (kind !== "REPLY_OPTED_OUT" && patient.doNotContact) return { ok: false, status: "SKIPPED", reason: "patient opted out" };
    return { ok: true };
  }
  if (!appointment) return { ok: false, status: "CANCELLED", reason: "reminder has no appointment" };
  if (kind === "REACTIVATION") {
    if (appointment.status !== "COMPLETED") {
      return { ok: false, status: "CANCELLED", reason: "appointment is no longer completed" };
    }
    if (patientHasUpcomingAppointment) {
      return { ok: false, status: "CANCELLED", reason: "patient already has an upcoming appointment" };
    }
  } else if (kind === "NO_SHOW_FOLLOWUP") {
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

export interface QuoteGuardInput {
  quote: { status: "OPEN" | "ACCEPTED" | "DECLINED"; createdAt: Date };
  patient: GuardInput["patient"];
}

/** Last check before handing a quote follow-up to n8n: the quote must still be open and valid. */
export function evaluateQuoteGuard({ quote, patient }: QuoteGuardInput, now: Date, validDays: number = QUOTE_VALID_DAYS): GuardResult {
  if (quote.status !== "OPEN") return { ok: false, status: "CANCELLED", reason: `quote is ${quote.status}` };
  if (now.getTime() - quote.createdAt.getTime() > validDays * 86_400_000) {
    return { ok: false, status: "CANCELLED", reason: "quote expired" };
  }
  if (patient.status !== "CONFIRMED") return { ok: false, status: "SKIPPED", reason: "patient not confirmed yet" };
  if (patient.doNotContact) return { ok: false, status: "SKIPPED", reason: "patient opted out" };
  if (!patient.consentAt) return { ok: false, status: "SKIPPED", reason: "no recorded consent" };
  return { ok: true };
}
