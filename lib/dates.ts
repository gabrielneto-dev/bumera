import { TZDate } from "@date-fns/tz";
import { CLINIC_TIME_ZONE } from "@/lib/schedule";

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDay(day: string): [number, number, number] {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new Error(`Invalid date "${day}", expected YYYY-MM-DD`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The clinic's current calendar day as YYYY-MM-DD. */
export function todayInClinic(now: Date = new Date()): string {
  const local = new TZDate(now.getTime(), CLINIC_TIME_ZONE);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/** Calendar arithmetic on a YYYY-MM-DD string (no timezone involved). */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = parseDay(day);
  const shifted = new Date(Date.UTC(year, month - 1, date + delta));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** "10:00" for an ISO instant, in the clinic's timezone. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "terça-feira, 20 de outubro de 2026". */
export function formatDayLong(day: string): string {
  const [year, month, date] = parseDay(day);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}
