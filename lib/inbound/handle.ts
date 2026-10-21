import type { PrismaClient } from "@/generated/prisma/client";
import { phoneCandidates, type InboundMessage } from "@/lib/inbound/evolution";
import { parseIntent } from "@/lib/inbound/intent";
import { syncReminders } from "@/lib/reminders/sync";
import { scopedPrisma, type ScopedPrisma } from "@/lib/tenant-scope";

export type InboundOutcome =
  | { outcome: "CONFIRMED" | "RESCHEDULE_REQUESTED"; appointmentId: string }
  | { outcome: "OPTED_OUT"; patients: number }
  | { outcome: "NO_APPOINTMENT" | "UNKNOWN_PATIENT" | "IGNORED" };

const LIVE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;

/**
 * Applies a patient's WhatsApp reply. Runs across clinics on purpose: the sender is identified
 * only by phone number, and consent withdrawal must reach every record of that number.
 * Every branch is safe to repeat (the webhook can be delivered more than once).
 */
export async function handleInboundMessage(
  prisma: PrismaClient,
  message: InboundMessage,
  now: Date,
): Promise<InboundOutcome> {
  const intent = parseIntent(message.text);
  if (intent === "UNKNOWN") return { outcome: "IGNORED" };

  const patients = await prisma.patient.findMany({
    where: { phoneE164: { in: phoneCandidates(message.phoneE164) } },
    select: { id: true },
  });
  if (patients.length === 0) return { outcome: "UNKNOWN_PATIENT" };
  const patientIds = patients.map((patient) => patient.id);

  if (intent === "OPT_OUT") return optOut(prisma, patientIds, now);

  const appointment = await prisma.appointment.findFirst({
    where: {
      patientId: { in: patientIds },
      status: { in: [...LIVE_STATUSES] },
      startsAt: { gt: now },
      patient: { doNotContact: false },
    },
    orderBy: { startsAt: "asc" },
  });
  if (!appointment) return { outcome: "NO_APPOINTMENT" };

  const db = scopedPrisma(prisma, appointment.organizationId);
  if (intent === "CONFIRM") {
    await db.$transaction(async (tx) => {
      if (appointment.status !== "CONFIRMED") {
        const row = await tx.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });
        await syncReminders(tx, row, now);
      }
      await queueReply(tx, appointment, "REPLY_CONFIRMED", now);
    });
    return { outcome: "CONFIRMED", appointmentId: appointment.id };
  }

  await db.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointment.id }, data: { rescheduleRequestedAt: now } });
    await tx.reminder.updateMany({
      where: { appointmentId: appointment.id, status: "PENDING", kind: { in: [...PLANNED_REMINDER_KINDS] } },
      data: { status: "CANCELLED", note: "patient asked to reschedule" },
    });
    await queueReply(tx, appointment, "REPLY_RESCHEDULE", now);
  });
  return { outcome: "RESCHEDULE_REQUESTED", appointmentId: appointment.id };
}

const PLANNED_REMINDER_KINDS = ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H", "NO_SHOW_FOLLOWUP"] as const;

type ReplyKind = "REPLY_CONFIRMED" | "REPLY_RESCHEDULE" | "REPLY_OPTED_OUT";
type ReplyDb = Pick<ScopedPrisma, "reminder">;

/**
 * Queues the automatic answer, due immediately, for n8n to pick up through /due. One per
 * (appointment, kind): a patient answering twice, or a webhook delivered twice, gets one reply.
 */
async function queueReply(
  db: ReplyDb,
  appointment: { id: string; organizationId: string },
  kind: ReplyKind,
  now: Date,
): Promise<void> {
  await db.reminder.upsert({
    where: { appointmentId_kind: { appointmentId: appointment.id, kind } },
    update: {},
    create: { organizationId: appointment.organizationId, appointmentId: appointment.id, kind, dueAt: now },
  });
}

async function optOut(prisma: PrismaClient, patientIds: string[], now: Date): Promise<InboundOutcome> {
  await prisma.$transaction([
    prisma.patient.updateMany({
      where: { id: { in: patientIds }, doNotContact: false },
      data: { doNotContact: true, optedOutAt: now },
    }),
    prisma.reminder.updateMany({
      where: { status: "PENDING", appointment: { patientId: { in: patientIds } } },
      data: { status: "SKIPPED", note: "patient opted out" },
    }),
  ]);
  // One acknowledgement, attached to the patient's latest appointment; without any there is nothing to attach it to.
  // A separate step is fine: if it fails, the webhook is retried and every step above is safe to repeat.
  const latest = await prisma.appointment.findFirst({
    where: { patientId: { in: patientIds } },
    orderBy: { startsAt: "desc" },
    select: { id: true, organizationId: true },
  });
  if (latest) await queueReply(scopedPrisma(prisma, latest.organizationId), latest, "REPLY_OPTED_OUT", now);
  return { outcome: "OPTED_OUT", patients: patientIds.length };
}
