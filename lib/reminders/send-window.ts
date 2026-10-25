import { TZDate } from "@date-fns/tz";
import { CLINIC_TIME_ZONE } from "@/lib/schedule";

export interface QuietSettings {
  quietEnabled: boolean;
  /** Local hour (0-23) at which the quiet period starts. */
  quietStartHour: number;
  /** Local hour (0-23) at which it ends; smaller than the start means it crosses midnight. */
  quietEndHour: number;
}

const local = (instant: Date): TZDate => new TZDate(instant.getTime(), CLINIC_TIME_ZONE);

/** True while patients should not be messaged on the clinic's initiative (night, by default 21:00-08:00). */
export function isQuietNow(now: Date, { quietEnabled, quietStartHour, quietEndHour }: QuietSettings): boolean {
  if (!quietEnabled) return false;
  const hour = local(now).getHours();
  return quietStartHour > quietEndHour ? hour >= quietStartHour || hour < quietEndHour : hour >= quietStartHour && hour < quietEndHour;
}

/** The first instant strictly after `now` whose local time is the quiet period's end hour, on the hour. */
export function nextQuietEnd(now: Date, { quietEndHour }: QuietSettings): Date {
  const day = local(now);
  const today = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), quietEndHour, 0, 0, 0, CLINIC_TIME_ZONE);
  if (today.getTime() > now.getTime()) return new Date(today.getTime());
  return new Date(new TZDate(day.getFullYear(), day.getMonth(), day.getDate() + 1, quietEndHour, 0, 0, 0, CLINIC_TIME_ZONE).getTime());
}

/** Local midnight that starts the clinic's current day (the daily limit counts from here). */
export function startOfLocalDay(now: Date): Date {
  const day = local(now);
  return new Date(new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0, CLINIC_TIME_ZONE).getTime());
}

/** When sending may resume tomorrow: local midnight, or the end of the quiet period if it covers midnight. */
export function nextDayWindowStart(now: Date, settings: QuietSettings): Date {
  const day = local(now);
  const midnight = new Date(new TZDate(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0, CLINIC_TIME_ZONE).getTime());
  return isQuietNow(midnight, settings) ? nextQuietEnd(midnight, settings) : midnight;
}
