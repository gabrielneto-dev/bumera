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
  appointment: { id: string; startsAt: string };
  patient: { id: string; name: string; phoneE164: string };
}

/**
 * Reminders that ran out of attempts (decision CTX-DEC-20261017-trigger-delivery-retries): the secretary
 * must know a patient was not reached. Failures about appointments more than a day gone are noise.
 */
export async function listFailedReminders(ctx: ServiceContext): Promise<FailedReminderDto[]> {
  assertCan(ctx.role, "appointment", "read");
  const rows = await ctx.db.reminder.findMany({
    where: { status: "FAILED", appointment: { startsAt: { gte: new Date(ctx.now().getTime() - DAY_MS) } } },
    include: { appointment: { select: { id: true, startsAt: true, patient: { select: { id: true, name: true, phoneE164: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    note: row.note,
    appointment: { id: row.appointment.id, startsAt: row.appointment.startsAt.toISOString() },
    patient: row.appointment.patient,
  }));
}

export interface InterestedPatientDto {
  /** The reminder the patient answered; used to mark the answer as handled. */
  id: string;
  kind: ReminderKind;
  answeredAt: string;
  procedureName: string;
  patient: { id: string; name: string; phoneE164: string };
}

/** Patients who answered a campaign message saying they want to come back, until a secretary handles it. */
export async function listInterestedPatients(ctx: ServiceContext): Promise<InterestedPatientDto[]> {
  assertCan(ctx.role, "appointment", "read");
  const rows = await ctx.db.reminder.findMany({
    where: { answer: "INTERESTED", handledAt: null },
    include: {
      appointment: {
        select: { procedure: { select: { name: true } }, patient: { select: { id: true, name: true, phoneE164: true } } },
      },
    },
    orderBy: { answeredAt: "asc" },
    take: LIST_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    answeredAt: (row.answeredAt ?? row.updatedAt).toISOString(),
    procedureName: row.appointment.procedure.name,
    patient: row.appointment.patient,
  }));
}

/** The secretary dealt with the patient's answer (called them, booked a slot). */
export async function markInterestHandled(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.role, "appointment", "update");
  const row = await ctx.db.reminder.findUnique({ where: { id } });
  if (!row || row.answer !== "INTERESTED") throw new AppError("NOT_FOUND", "Registro não encontrado", { resource: "reminder" });
  await ctx.db.reminder.update({ where: { id }, data: { handledAt: ctx.now() } });
}
