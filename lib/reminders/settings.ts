/**
 * Per-clinic message timings (decision CTX-DEC-20261017-clinic-defined-reminders). A clinic that never
 * saved anything uses these defaults, which are the timings the pilot started with.
 */
export interface ClinicSettings {
  /** Message right after an appointment is booked. */
  confirmationEnabled: boolean;
  /** First reminder (asks unconfirmed patients to confirm), in hours before the appointment. */
  reminder1Enabled: boolean;
  reminder1HoursBefore: number;
  /** Second reminder, in hours before the appointment. */
  reminder2Enabled: boolean;
  reminder2HoursBefore: number;
  /** Invitation to reschedule after a no-show, in hours after the appointment ended. */
  noShowEnabled: boolean;
  noShowDelayHours: number;
  /** Quote follow-ups, in days after the quote, and how long a quote stays valid. */
  quoteFollowup1Days: number;
  quoteFollowup2Days: number;
  quoteValidDays: number;
  /** No messages on the clinic's initiative during these local hours; replies to a patient are exempt. */
  quietEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  /** Messages handed to n8n per local day; replies are counted but never blocked. */
  dailySendLimit: number;
  /** Welcome first contacts on WhatsApp and guide them to a booking request (module 4). */
  bookingEnabled: boolean;
}

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
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
  bookingEnabled: true,
};

/** Picks the settings fields out of a database row; no row means the defaults. */
export function toClinicSettings(row: ClinicSettings | null | undefined): ClinicSettings {
  if (!row) return DEFAULT_CLINIC_SETTINGS;
  return {
    confirmationEnabled: row.confirmationEnabled,
    reminder1Enabled: row.reminder1Enabled,
    reminder1HoursBefore: row.reminder1HoursBefore,
    reminder2Enabled: row.reminder2Enabled,
    reminder2HoursBefore: row.reminder2HoursBefore,
    noShowEnabled: row.noShowEnabled,
    noShowDelayHours: row.noShowDelayHours,
    quoteFollowup1Days: row.quoteFollowup1Days,
    quoteFollowup2Days: row.quoteFollowup2Days,
    quoteValidDays: row.quoteValidDays,
    quietEnabled: row.quietEnabled,
    quietStartHour: row.quietStartHour,
    quietEndHour: row.quietEndHour,
    dailySendLimit: row.dailySendLimit,
    bookingEnabled: row.bookingEnabled,
  };
}
