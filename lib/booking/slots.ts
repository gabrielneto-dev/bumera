import { freeSlots } from "@/lib/services/appointments";
import type { ServiceContext } from "@/lib/services/context";
import { shiftDay, todayInClinic } from "@/lib/dates";

const DAYS_AHEAD = 14;
const LEAD_TIME_MS = 2 * 3_600_000;
/** The earliest slot of the morning and of the afternoon, per dentist and day: variety instead of 8:00, 8:30, 9:00. */
const AFTERNOON_FROM_HOUR = 13;

export interface SlotOption {
  startsAt: string;
  dentistId: string;
  dentistName: string;
}

export interface SlotPage {
  slots: SlotOption[];
  hasMore: boolean;
}

function localHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso)));
}

/**
 * The next free times to offer for a procedure, across the clinic's active dentists, in pages. Only real free
 * slots are ever offered: the AI never invents a time. Slots closer than two hours are not offered.
 */
export async function findNextSlots(ctx: ServiceContext, options: { procedureId: string; offset: number; limit: number }): Promise<SlotPage> {
  const now = ctx.now();
  const dentists = await ctx.db.dentist.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const earliest = now.getTime() + LEAD_TIME_MS;
  const today = todayInClinic(now);
  const picked: SlotOption[] = [];

  for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
    const day = shiftDay(today, offset);
    for (const dentist of dentists) {
      const free = (await freeSlots(ctx, { dentistId: dentist.id, procedureId: options.procedureId, day })).filter((iso) => new Date(iso).getTime() >= earliest);
      const morning = free.find((iso) => localHour(iso) < AFTERNOON_FROM_HOUR);
      const afternoon = free.find((iso) => localHour(iso) >= AFTERNOON_FROM_HOUR);
      for (const iso of [morning, afternoon]) {
        if (iso) picked.push({ startsAt: iso, dentistId: dentist.id, dentistName: dentist.name });
      }
    }
  }
  picked.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const page = picked.slice(options.offset, options.offset + options.limit);
  return { slots: page, hasMore: picked.length > options.offset + options.limit };
}
