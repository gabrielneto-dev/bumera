import type { AppointmentStatus, Prisma } from "@/generated/prisma/client";
import { assertCan } from "@/lib/authz";
import { isOverlapViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { appointmentInputSchema, parseInput } from "@/lib/schemas";
import {
  CLINIC_TIME_ZONE,
  isWithinWorkingHours,
  listFreeSlots,
  zonedDayRange,
} from "@/lib/schedule";
import type { ServiceContext } from "@/lib/services/context";

const MS_PER_MINUTE = 60_000;
const DEFAULT_SLOT_STEP_MIN = 30;
/** Statuses that free the dentist's time (mirrors the database exclusion constraint). */
const FREEING_STATUSES: AppointmentStatus[] = ["CANCELLED", "NO_SHOW"];

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDING: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const include = {
  patient: { select: { id: true, name: true, phoneE164: true } },
  dentist: { select: { id: true, name: true } },
  procedure: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof include }>;

export interface AppointmentDto {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: "SECRETARY" | "WHATSAPP";
  patient: { id: string; name: string; phoneE164: string };
  dentist: { id: string; name: string };
  procedure: { id: string; name: string };
}

function toDto(row: AppointmentRow): AppointmentDto {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    source: row.source,
    patient: row.patient,
    dentist: row.dentist,
    procedure: row.procedure,
  };
}

function notFound(resource: string): AppError {
  return new AppError("NOT_FOUND", "Registro não encontrado", { resource });
}

async function loadBookingTargets(ctx: ServiceContext, ids: { patientId: string; dentistId: string; procedureId: string }) {
  const [patient, dentist, procedure] = await Promise.all([
    ctx.db.patient.findUnique({ where: { id: ids.patientId }, select: { id: true } }),
    ctx.db.dentist.findUnique({ where: { id: ids.dentistId } }),
    ctx.db.procedure.findUnique({ where: { id: ids.procedureId } }),
  ]);
  if (!patient) throw notFound("patient");
  if (!dentist) throw notFound("dentist");
  if (!procedure) throw notFound("procedure");
  if (!dentist.active || !procedure.active) {
    throw new AppError("INACTIVE_RESOURCE", "Dentista ou procedimento inativo", {
      resource: dentist.active ? "procedure" : "dentist",
    });
  }
  return { dentist, procedure };
}

export async function bookAppointment(ctx: ServiceContext, rawInput: unknown): Promise<AppointmentDto> {
  assertCan(ctx.role, "appointment", "create");
  const input = parseInput(appointmentInputSchema, rawInput);
  const { dentist, procedure } = await loadBookingTargets(ctx, input);

  const startsAt = new Date(input.startsAt);
  if (startsAt < ctx.now()) {
    throw new AppError("PAST_APPOINTMENT", "Não é possível agendar no passado");
  }
  const durationMin = input.durationMin ?? procedure.defaultDurationMin;
  const endsAt = new Date(startsAt.getTime() + durationMin * MS_PER_MINUTE);

  if (!isWithinWorkingHours({ startsAt, endsAt, timeZone: CLINIC_TIME_ZONE, ...dentist })) {
    throw new AppError("OUTSIDE_WORKING_HOURS", "Fora do horário de atendimento do dentista");
  }

  try {
    const row = await ctx.db.appointment.create({
      data: {
        organizationId: ctx.organizationId,
        patientId: input.patientId,
        dentistId: input.dentistId,
        procedureId: input.procedureId,
        startsAt,
        endsAt,
        createdById: ctx.userId,
      },
      include,
    });
    return toDto(row);
  } catch (error) {
    if (isOverlapViolation(error)) {
      throw new AppError("SLOT_TAKEN", "Este horário já está ocupado para o dentista");
    }
    throw error;
  }
}

export async function changeAppointmentStatus(
  ctx: ServiceContext,
  id: string,
  to: AppointmentStatus,
): Promise<AppointmentDto> {
  assertCan(ctx.role, "appointment", to === "CANCELLED" ? "cancel" : "update");
  const current = await ctx.db.appointment.findUnique({ where: { id } });
  if (!current) throw notFound("appointment");
  if (!TRANSITIONS[current.status].includes(to)) {
    throw new AppError("INVALID_TRANSITION", "Esta mudança de status não é permitida", {
      from: current.status,
      to,
    });
  }
  return toDto(await ctx.db.appointment.update({ where: { id }, data: { status: to }, include }));
}

export interface ListDayOptions {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  dentistId?: string;
  includeCancelled?: boolean;
}

export async function listDay(ctx: ServiceContext, options: ListDayOptions): Promise<AppointmentDto[]> {
  assertCan(ctx.role, "appointment", "read");
  const { start, end } = zonedDayRange(options.day, CLINIC_TIME_ZONE);
  const rows = await ctx.db.appointment.findMany({
    where: {
      startsAt: { gte: start, lt: end },
      ...(options.dentistId ? { dentistId: options.dentistId } : {}),
      ...(options.includeCancelled ? {} : { status: { notIn: ["CANCELLED"] } }),
    },
    include,
    orderBy: { startsAt: "asc" },
  });
  return rows.map(toDto);
}

export interface FreeSlotsOptions {
  dentistId: string;
  procedureId: string;
  day: string;
  durationMin?: number;
  stepMin?: number;
}

/** Start times (ISO, UTC) where the procedure fits in the dentist's day. */
export async function freeSlots(ctx: ServiceContext, options: FreeSlotsOptions): Promise<string[]> {
  assertCan(ctx.role, "appointment", "read");
  const [dentist, procedure] = await Promise.all([
    ctx.db.dentist.findUnique({ where: { id: options.dentistId } }),
    ctx.db.procedure.findUnique({ where: { id: options.procedureId } }),
  ]);
  if (!dentist) throw notFound("dentist");
  if (!procedure) throw notFound("procedure");

  const { start, end } = zonedDayRange(options.day, CLINIC_TIME_ZONE);
  const busy = await ctx.db.appointment.findMany({
    where: {
      dentistId: dentist.id,
      startsAt: { lt: end },
      endsAt: { gt: start },
      status: { notIn: FREEING_STATUSES },
    },
    select: { startsAt: true, endsAt: true },
  });

  return listFreeSlots({
    day: options.day,
    timeZone: CLINIC_TIME_ZONE,
    workStart: dentist.workStart,
    workEnd: dentist.workEnd,
    workDays: dentist.workDays,
    durationMin: options.durationMin ?? procedure.defaultDurationMin,
    stepMin: options.stepMin ?? DEFAULT_SLOT_STEP_MIN,
    busy,
    now: ctx.now(),
  }).map((slot) => slot.toISOString());
}
