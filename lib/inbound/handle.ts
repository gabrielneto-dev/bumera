import type { PrismaClient, ReminderKind } from "@/generated/prisma/client";
import { phoneCandidates, type InboundMessage } from "@/lib/inbound/evolution";
import { parseIntent } from "@/lib/inbound/intent";
import { toClinicSettings } from "@/lib/reminders/settings";
import { syncQuoteReminders, syncReminders } from "@/lib/reminders/sync";
import { scopedPrisma, type ScopedPrisma } from "@/lib/tenant-scope";

export type InboundOutcome =
  | { outcome: "CONFIRMED" | "RESCHEDULE_REQUESTED" | "INTERESTED" | "DECLINED"; appointmentId?: string; quoteId?: string }
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

  const campaign = await openCampaignMessage(prisma, patientIds, now);
  if (campaign) return answerCampaign(prisma, campaign, intent === "CONFIRM" ? "INTERESTED" : "DECLINED", now);

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
    const settings = toClinicSettings(await db.clinicSettings.findUnique({ where: { organizationId: appointment.organizationId } }));
    await db.$transaction(async (tx) => {
      if (appointment.status !== "CONFIRMED") {
        const row = await tx.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });
        await syncReminders(tx, row, now, settings);
      }
      await queueReply(tx, { organizationId: appointment.organizationId, appointmentId: appointment.id }, "REPLY_CONFIRMED", now);
    });
    return { outcome: "CONFIRMED", appointmentId: appointment.id };
  }

  await db.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointment.id }, data: { rescheduleRequestedAt: now } });
    await tx.reminder.updateMany({
      where: { appointmentId: appointment.id, status: "PENDING", kind: { in: [...PLANNED_REMINDER_KINDS] } },
      data: { status: "CANCELLED", note: "patient asked to reschedule" },
    });
    await queueReply(tx, { organizationId: appointment.organizationId, appointmentId: appointment.id }, "REPLY_RESCHEDULE", now);
  });
  return { outcome: "RESCHEDULE_REQUESTED", appointmentId: appointment.id };
}

const CAMPAIGN_KINDS: readonly ReminderKind[] = ["REACTIVATION", "QUOTE_FOLLOWUP_1", "QUOTE_FOLLOWUP_2"];
/** A campaign message keeps meaning "1 / 2" for this long; after that the replies are read as usual. */
const CAMPAIGN_WINDOW_MS = 14 * 24 * 3_600_000;

/**
 * The campaign message the patient is most likely answering: the latest message sent to them,
 * when it was a campaign one, is still unanswered and recent. Appointment reminders sent after it win.
 */
async function openCampaignMessage(prisma: PrismaClient, patientIds: string[], now: Date) {
  const latest = await prisma.reminder.findFirst({
    where: {
      status: "SENT",
      sentAt: { not: null },
      OR: [{ appointment: { patientId: { in: patientIds } } }, { quote: { patientId: { in: patientIds } } }],
      kind: { notIn: ["REPLY_CONFIRMED", "REPLY_RESCHEDULE", "REPLY_OPTED_OUT", "REPLY_INTERESTED", "REPLY_DECLINED"] },
    },
    orderBy: { sentAt: "desc" },
  });
  if (!latest?.sentAt || latest.answer !== null) return null;
  if (!CAMPAIGN_KINDS.includes(latest.kind) || now.getTime() - latest.sentAt.getTime() > CAMPAIGN_WINDOW_MS) return null;
  return latest;
}

async function answerCampaign(
  prisma: PrismaClient,
  campaign: { id: string; organizationId: string; appointmentId: string | null; quoteId: string | null },
  answer: "INTERESTED" | "DECLINED",
  now: Date,
): Promise<InboundOutcome> {
  const replyKind: ReplyKind = answer === "INTERESTED" ? "REPLY_INTERESTED" : "REPLY_DECLINED";
  const { appointmentId, quoteId, organizationId } = campaign;
  await scopedPrisma(prisma, organizationId).$transaction(async (tx) => {
    await tx.reminder.update({ where: { id: campaign.id }, data: { answer, answeredAt: now } });
    if (quoteId) {
      if (answer === "DECLINED") {
        // "Not now" closes the quote: no more follow-ups.
        const quote = await tx.quote.update({ where: { id: quoteId }, data: { status: "DECLINED", closedAt: now } });
        await syncQuoteReminders(tx, quote, now);
      }
      await queueReply(tx, { organizationId, quoteId }, replyKind, now);
    } else if (appointmentId) {
      await queueReply(tx, { organizationId, appointmentId }, replyKind, now);
    }
  });
  return quoteId ? { outcome: answer, quoteId } : { outcome: answer, appointmentId: appointmentId ?? undefined };
}

const PLANNED_REMINDER_KINDS = ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H", "NO_SHOW_FOLLOWUP"] as const;

type ReplyKind = "REPLY_CONFIRMED" | "REPLY_RESCHEDULE" | "REPLY_OPTED_OUT" | "REPLY_INTERESTED" | "REPLY_DECLINED";
type ReplyDb = Pick<ScopedPrisma, "reminder">;
/** What a reply is about: an appointment or a quote, inside one clinic. */
type ReplySubject = { organizationId: string } & ({ appointmentId: string } | { quoteId: string });

/**
 * Queues the automatic answer, due immediately, for n8n to pick up through /due. One per
 * (subject, kind): a patient answering twice, or a webhook delivered twice, gets one reply.
 */
async function queueReply(db: ReplyDb, subject: ReplySubject, kind: ReplyKind, now: Date): Promise<void> {
  const { organizationId } = subject;
  if ("appointmentId" in subject) {
    const { appointmentId } = subject;
    await db.reminder.upsert({
      where: { appointmentId_kind: { appointmentId, kind } },
      update: {},
      create: { organizationId, appointmentId, kind, dueAt: now },
    });
    return;
  }
  const { quoteId } = subject;
  await db.reminder.upsert({
    where: { quoteId_kind: { quoteId, kind } },
    update: {},
    create: { organizationId, quoteId, kind, dueAt: now },
  });
}

async function optOut(prisma: PrismaClient, patientIds: string[], now: Date): Promise<InboundOutcome> {
  await prisma.$transaction([
    prisma.patient.updateMany({
      where: { id: { in: patientIds }, doNotContact: false },
      data: { doNotContact: true, optedOutAt: now },
    }),
    prisma.reminder.updateMany({
      where: {
        status: "PENDING",
        OR: [{ appointment: { patientId: { in: patientIds } } }, { quote: { patientId: { in: patientIds } } }],
      },
      data: { status: "SKIPPED", note: "patient opted out" },
    }),
  ]);
  // One acknowledgement, attached to the patient's latest appointment or, failing that, latest quote;
  // without either there is nothing to attach it to. A separate step is fine: if it fails, the webhook
  // is retried and every step above is safe to repeat.
  const appointment = await prisma.appointment.findFirst({
    where: { patientId: { in: patientIds } },
    orderBy: { startsAt: "desc" },
    select: { id: true, organizationId: true },
  });
  if (appointment) {
    const db = scopedPrisma(prisma, appointment.organizationId);
    await queueReply(db, { organizationId: appointment.organizationId, appointmentId: appointment.id }, "REPLY_OPTED_OUT", now);
  } else {
    const quote = await prisma.quote.findFirst({
      where: { patientId: { in: patientIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true, organizationId: true },
    });
    if (quote) {
      await queueReply(scopedPrisma(prisma, quote.organizationId), { organizationId: quote.organizationId, quoteId: quote.id }, "REPLY_OPTED_OUT", now);
    }
  }
  return { outcome: "OPTED_OUT", patients: patientIds.length };
}
