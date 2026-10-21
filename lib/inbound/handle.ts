import type { PrismaClient } from "@/generated/prisma/client";
import { phoneCandidates, type InboundMessage } from "@/lib/inbound/evolution";
import { parseIntent } from "@/lib/inbound/intent";
import { syncReminders } from "@/lib/reminders/sync";
import { scopedPrisma } from "@/lib/tenant-scope";

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

  if (intent === "CONFIRM") {
    if (appointment.status !== "CONFIRMED") {
      await scopedPrisma(prisma, appointment.organizationId).$transaction(async (tx) => {
        const row = await tx.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });
        await syncReminders(tx, row, now);
      });
    }
    return { outcome: "CONFIRMED", appointmentId: appointment.id };
  }

  await prisma.$transaction([
    prisma.appointment.update({ where: { id: appointment.id }, data: { rescheduleRequestedAt: now } }),
    prisma.reminder.updateMany({
      where: { appointmentId: appointment.id, status: "PENDING" },
      data: { status: "CANCELLED", note: "patient asked to reschedule" },
    }),
  ]);
  return { outcome: "RESCHEDULE_REQUESTED", appointmentId: appointment.id };
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
  return { outcome: "OPTED_OUT", patients: patientIds.length };
}
