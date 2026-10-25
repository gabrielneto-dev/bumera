import type { ReminderKind } from "@/generated/prisma/client";
import { assertCan } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import type { ServiceContext } from "@/lib/services/context";

const DAY_MS = 86_400_000;
const LIST_LIMIT = 50;

export interface FailedReminderDto {
  id: string;
  kind: ReminderKind;
  note: string | null;
  appointment: { id: string; startsAt: string } | null;
  quote: { id: string; description: string } | null;
  patient: { id: string; name: string; phoneE164: string };
}

const patientSelect = { select: { id: true, name: true, phoneE164: true } } as const;

/**
 * Reminders that ran out of attempts (decision CTX-DEC-20261017-trigger-delivery-retries): the secretary
 * must know a patient was not reached. Failures about appointments more than a day gone are noise;
 * for quotes they matter while the quote is still open.
 */
export async function listFailedReminders(ctx: ServiceContext): Promise<FailedReminderDto[]> {
  assertCan(ctx.role, "appointment", "read");
  const rows = await ctx.db.reminder.findMany({
    where: {
      status: "FAILED",
      OR: [{ appointment: { startsAt: { gte: new Date(ctx.now().getTime() - DAY_MS) } } }, { quote: { status: "OPEN" } }],
    },
    include: {
      appointment: { select: { id: true, startsAt: true, patient: patientSelect } },
      quote: { select: { id: true, description: true, patient: patientSelect } },
    },
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
  });
  return rows.flatMap((row) => {
    const patient = row.appointment?.patient ?? row.quote?.patient;
    if (!patient) return [];
    return [
      {
        id: row.id,
        kind: row.kind,
        note: row.note,
        appointment: row.appointment ? { id: row.appointment.id, startsAt: row.appointment.startsAt.toISOString() } : null,
        quote: row.quote ? { id: row.quote.id, description: row.quote.description } : null,
        patient,
      },
    ];
  });
}

export interface InterestedPatientDto {
  /** The reminder the patient answered; used to mark the answer as handled. */
  id: string;
  kind: ReminderKind;
  answeredAt: string;
  /** Set for reactivation answers. */
  procedureName: string | null;
  /** Set for quote answers. */
  quoteDescription: string | null;
  patient: { id: string; name: string; phoneE164: string };
}

/** Patients who answered a campaign message saying they want to come back, until a secretary handles it. */
export async function listInterestedPatients(ctx: ServiceContext): Promise<InterestedPatientDto[]> {
  assertCan(ctx.role, "appointment", "read");
  const rows = await ctx.db.reminder.findMany({
    where: { answer: "INTERESTED", handledAt: null },
    include: {
      appointment: { select: { procedure: { select: { name: true } }, patient: patientSelect } },
      quote: { select: { description: true, patient: patientSelect } },
    },
    orderBy: { answeredAt: "asc" },
    take: LIST_LIMIT,
  });
  return rows.flatMap((row) => {
    const patient = row.appointment?.patient ?? row.quote?.patient;
    if (!patient) return [];
    return [
      {
        id: row.id,
        kind: row.kind,
        answeredAt: (row.answeredAt ?? row.updatedAt).toISOString(),
        procedureName: row.appointment?.procedure.name ?? null,
        quoteDescription: row.quote?.description ?? null,
        patient,
      },
    ];
  });
}

/** The secretary dealt with the patient's answer (called them, booked a slot). */
export async function markInterestHandled(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.role, "appointment", "update");
  const row = await ctx.db.reminder.findUnique({ where: { id } });
  if (!row || row.answer !== "INTERESTED") throw new AppError("NOT_FOUND", "Registro não encontrado", { resource: "reminder" });
  await ctx.db.reminder.update({ where: { id }, data: { handledAt: ctx.now() } });
}
