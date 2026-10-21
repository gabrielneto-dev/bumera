import type { ReminderKind } from "@/generated/prisma/client";
import { assertCan } from "@/lib/authz";
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
