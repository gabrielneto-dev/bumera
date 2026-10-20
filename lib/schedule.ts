import { TZDate } from "@date-fns/tz";

export const CLINIC_TIME_ZONE = "America/Sao_Paulo";

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_MINUTE = 60_000;
const NOON = 12;

export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface FreeSlotOptions {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  timeZone: string;
  /** "HH:MM" local working window. */
  workStart: string;
  workEnd: string;
  /** 0 = Sunday ... 6 = Saturday. */
  workDays: readonly number[];
  durationMin: number;
  stepMin: number;
  busy: readonly BusyInterval[];
  /** Slots starting before this instant are dropped. */
  now?: Date;
}

function parseDay(day: string): [number, number, number] {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new Error(`Invalid date "${day}", expected YYYY-MM-DD`);
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

function parseTime(time: string): [number, number] {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new Error(`Invalid time "${time}", expected HH:MM`);
  return [Number(match[1]), Number(match[2])];
}

/** UTC instants that bound the clinic's local calendar day: [start, end). */
export function zonedDayRange(day: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, date] = parseDay(day);
  const start = new TZDate(year, month, date, 0, 0, 0, 0, timeZone);
  const end = new TZDate(year, month, date + 1, 0, 0, 0, 0, timeZone);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** Start times (UTC instants) where an appointment of `durationMin` fits and is not busy. */
export function listFreeSlots(options: FreeSlotOptions): Date[] {
  const { day, timeZone, durationMin, stepMin, busy, now } = options;
  if (durationMin <= 0 || stepMin <= 0) {
    throw new Error("durationMin and stepMin must be positive");
  }
  const [year, month, date] = parseDay(day);
  const weekday = new TZDate(year, month, date, NOON, 0, 0, 0, timeZone).getDay();
  if (!options.workDays.includes(weekday)) return [];

  const [startHour, startMinute] = parseTime(options.workStart);
  const [endHour, endMinute] = parseTime(options.workEnd);
  const windowStart = new TZDate(year, month, date, startHour, startMinute, 0, 0, timeZone).getTime();
  const windowEnd = new TZDate(year, month, date, endHour, endMinute, 0, 0, timeZone).getTime();
  const durationMs = durationMin * MS_PER_MINUTE;
  const stepMs = stepMin * MS_PER_MINUTE;

  const slots: Date[] = [];
  for (let start = windowStart; start + durationMs <= windowEnd; start += stepMs) {
    if (now && start < now.getTime()) continue;
    const end = start + durationMs;
    const overlaps = busy.some(
      (interval) => start < interval.endsAt.getTime() && end > interval.startsAt.getTime(),
    );
    if (!overlaps) slots.push(new Date(start));
  }
  return slots;
}

export interface WorkingHours {
  timeZone: string;
  workStart: string;
  workEnd: string;
  workDays: readonly number[];
}

const MINUTES_PER_HOUR = 60;

function minutesOfDay(date: Date): number {
  return date.getHours() * MINUTES_PER_HOUR + date.getMinutes();
}

/** True when the whole appointment fits inside one working day window of the clinic. */
export function isWithinWorkingHours(
  options: WorkingHours & { startsAt: Date; endsAt: Date },
): boolean {
  const start = new TZDate(options.startsAt.getTime(), options.timeZone);
  const end = new TZDate(options.endsAt.getTime(), options.timeZone);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (!sameDay || !options.workDays.includes(start.getDay())) return false;

  const [startHour, startMinute] = parseTime(options.workStart);
  const [endHour, endMinute] = parseTime(options.workEnd);
  return (
    minutesOfDay(start) >= startHour * MINUTES_PER_HOUR + startMinute &&
    minutesOfDay(end) <= endHour * MINUTES_PER_HOUR + endMinute
  );
}
