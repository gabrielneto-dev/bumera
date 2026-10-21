import type { AppointmentStatus, ReminderKind } from "@/generated/prisma/client";
import { planReminders } from "@/lib/reminders/plan";
import type { ScopedPrisma } from "@/lib/tenant-scope";

type ReminderDb = Pick<ScopedPrisma, "reminder">;

export interface SyncedAppointment {
  id: string;
  organizationId: string;
  status: AppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  reactivateAfterMonths?: number | null;
}

/** Kinds whose dueAt follows the appointment time; the others keep the moment they were created. */
const TIMED_KINDS: readonly ReminderKind[] = ["REMINDER_24H", "REMINDER_2H"];
const OPEN_STATUSES = ["PENDING", "CLAIMED"] as const;
/** Kinds the plan manages; automatic replies are queued by the inbound handler and never obsolete here. */
const PLANNED_KINDS: readonly ReminderKind[] = ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H", "NO_SHOW_FOLLOWUP", "REACTIVATION"];

/**
 * Brings the appointment's unsent reminders in line with what the plan says should exist.
 * Call it inside the same transaction as every appointment change. Reminders that were
 * already sent, failed or skipped are history and are never touched.
 */
export async function syncReminders(db: ReminderDb, appointment: SyncedAppointment, now: Date): Promise<void> {
  const planned = planReminders({ ...appointment, now });
  const existing = await db.reminder.findMany({ where: { appointmentId: appointment.id } });
  const byKind = new Map(existing.map((row) => [row.kind, row]));
  const plannedKinds = new Set(planned.map((item) => item.kind));

  for (const item of planned) {
    const current = byKind.get(item.kind);
    if (!current) {
      // upsert: two simultaneous syncs of one appointment must not collide on the unique key.
      await db.reminder.upsert({
        where: { appointmentId_kind: { appointmentId: appointment.id, kind: item.kind } },
        update: {},
        create: { organizationId: appointment.organizationId, appointmentId: appointment.id, kind: item.kind, dueAt: item.dueAt },
      });
    } else if (
      current.status === "PENDING" &&
      TIMED_KINDS.includes(item.kind) &&
      current.dueAt.getTime() !== item.dueAt.getTime()
    ) {
      await db.reminder.updateMany({ where: { id: current.id, status: "PENDING" }, data: { dueAt: item.dueAt } });
    }
  }

  const obsolete = existing.filter(
    (row) => PLANNED_KINDS.includes(row.kind) && !plannedKinds.has(row.kind) && (OPEN_STATUSES as readonly string[]).includes(row.status),
  );
  for (const row of obsolete) {
    // Conditional, so a reminder that was sent in the meantime is never rewritten.
    await db.reminder.updateMany({
      where: { id: row.id, status: { in: [...OPEN_STATUSES] } },
      data: { status: "CANCELLED", note: `appointment is ${appointment.status}` },
    });
  }
}
