import type { PrismaClient, ReminderKind } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { phoneCandidates, type InboundMessage } from "@/lib/inbound/evolution";
import type { AiClient, AiContext } from "@/lib/ai/types";
import { closeOpenConversations, continueConversation, findOpenConversation, startConversation } from "@/lib/booking/conversation";
import { isGreeting, looksLikeBookingRequest } from "@/lib/booking/text";
import { receiveFreeText } from "@/lib/inbound/free-text";
import { parseIntent } from "@/lib/inbound/intent";
import { isUrgent } from "@/lib/inbound/urgent";
import { queueReply, type ReplyKind } from "@/lib/inbound/reply";
import { toClinicSettings } from "@/lib/reminders/settings";
import { syncQuoteReminders, syncReminders } from "@/lib/reminders/sync";
import { scopedPrisma } from "@/lib/tenant-scope";

/** A patient's message, already tied to the clinic whose WhatsApp number received it. */
export interface ClinicMessage extends InboundMessage {
  organizationId: string;
}

export type InboundOutcome =
  | { outcome: "CONFIRMED" | "RESCHEDULE_REQUESTED" | "INTERESTED" | "DECLINED"; appointmentId?: string; quoteId?: string }
  | { outcome: "OPTED_OUT"; patients: number }
  | { outcome: "NO_APPOINTMENT" | "UNKNOWN_PATIENT" | "UNKNOWN_INSTANCE" | "IGNORED" | "HANDOFF" | "ANSWERED_BY_AI" | "CONVERSATION" }
  | { outcome: "BOOKING_REQUESTED"; appointmentId: string };

/** Injected in tests; by default the AI client is built from the clinic's saved key (none = no AI). */
export interface InboundDeps {
  ai?: AiClient | null;
}

/** The three things a reply can mean, whether the patient typed a keyword or the AI read their own words. */
export type ReplyIntent = "CONFIRM" | "RESCHEDULE" | "OPT_OUT";

const LIVE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;

/**
 * Applies a patient's WhatsApp reply inside the clinic whose number received it: the same person may be a
 * patient of several clinics, and a message sent to one must never act on another's appointments or consent.
 * Every branch is safe to repeat (the webhook can be delivered more than once).
 */
export async function handleInboundMessage(
  prisma: PrismaClient,
  message: ClinicMessage,
  now: Date,
  deps: InboundDeps = {},
): Promise<InboundOutcome> {
  const intent = parseIntent(message.text);

  const patients = await prisma.patient.findMany({
    where: { organizationId: message.organizationId, phoneE164: { in: phoneCandidates(message.phoneE164) } },
    select: { id: true, doNotContact: true, guardianName: true },
    orderBy: { createdAt: "asc" },
  });
  const phones = phoneCandidates(message.phoneE164);
  const settings = await prisma.clinicSettings.findUnique({ where: { organizationId: message.organizationId }, select: { bookingEnabled: true } });
  const bookingEnabled = settings?.bookingEnabled ?? true;

  if (patients.length === 0) {
    // A first contact. Opting out means nothing for someone we hold no record of; anyone else is welcomed.
    if (intent === "OPT_OUT") {
      await closeOpenConversations(prisma, message.organizationId, phones);
      return { outcome: "UNKNOWN_PATIENT" };
    }
    if (!bookingEnabled) return { outcome: "UNKNOWN_PATIENT" };
    const open = await findOpenConversation(prisma, message.organizationId, phones, now);
    return open ? continueConversation(prisma, message, open, now, deps.ai) : startConversation(prisma, message, null, now, deps.ai);
  }
  const patientIds = patients.map((patient) => patient.id);

  if (intent === "OPT_OUT") {
    const result = await optOut(prisma, message.organizationId, patientIds, now);
    await closeOpenConversations(prisma, message.organizationId, phones);
    return result;
  }

  // An open booking conversation owns the numbers: "1" is a menu choice there, not a confirmation.
  const open = bookingEnabled ? await findOpenConversation(prisma, message.organizationId, phones, now) : null;
  if (open) return continueConversation(prisma, message, open, now, deps.ai);

  if (intent === "UNKNOWN") {
    // Free text: a request to book starts the dialog; anything else is kept for the secretary, unless the
    // patient asked not to be contacted at all.
    // The adult who owns the phone, not a dependent that shares it.
    const reachable = patients.find((patient) => !patient.doNotContact && !patient.guardianName) ?? patients.find((patient) => !patient.doNotContact);
    if (!reachable) return { outcome: "IGNORED" };
    if (bookingEnabled && !isUrgent(message.text) && (looksLikeBookingRequest(message.text) || isGreeting(message.text))) return startConversation(prisma, message, reachable, now, deps.ai);
    return receiveFreeText(prisma, message, reachable.id, now, {
      ai: deps.ai,
      apply: (aiIntent) => applyIntent(prisma, message, aiIntent, patientIds, now),
      context: () => describeContext(prisma, patientIds, now),
      startBooking: () => (bookingEnabled ? startConversation(prisma, message, reachable, now, deps.ai) : Promise.resolve({ outcome: "HANDOFF" as const })),
    });
  }

  return applyIntent(prisma, message, intent, patientIds, now);
}

/** What the clinic last asked this patient, so "sim" can be read correctly. */
async function describeContext(prisma: PrismaClient, patientIds: string[], now: Date): Promise<AiContext> {
  if (await openCampaignMessage(prisma, patientIds, now)) return "campaign";
  const upcoming = await prisma.appointment.count({
    where: { patientId: { in: patientIds }, status: { in: [...LIVE_STATUSES] }, startsAt: { gt: now } },
  });
  return upcoming > 0 ? "appointment" : "none";
}

async function applyIntent(
  prisma: PrismaClient,
  message: ClinicMessage,
  intent: ReplyIntent,
  patientIds: string[],
  now: Date,
): Promise<InboundOutcome> {
  if (intent === "OPT_OUT") return optOut(prisma, message.organizationId, patientIds, now);

  const campaign = await openCampaignMessage(prisma, patientIds, now);
  if (campaign) return answerCampaign(prisma, campaign, intent === "CONFIRM" ? "INTERESTED" : "DECLINED", now);

  const appointment = await findSubjectAppointment(prisma, patientIds, intent, now);
  if (!appointment) return { outcome: "NO_APPOINTMENT" };

  const db = scopedPrisma(prisma, appointment.organizationId);
  if (intent === "CONFIRM") {
    const settings = toClinicSettings(await db.clinicSettings.findUnique({ where: { organizationId: appointment.organizationId } }));
    await db.$transaction(async (tx) => {
      if (appointment.status !== "CONFIRMED") {
        const row = await tx.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });
        await syncReminders(tx, row, now, settings);
      }
      const others = await tx.appointment.count({
        where: { patientId: { in: patientIds }, status: "SCHEDULED", startsAt: { gt: now }, NOT: { id: appointment.id } },
      });
      const note = others > 0 ? `Ainda há ${others} ${others === 1 ? "consulta aguardando" : "consultas aguardando"} confirmação: responda 1 de novo para confirmar a próxima.` : undefined;
      await queueReply(tx, { organizationId: appointment.organizationId, appointmentId: appointment.id }, "REPLY_CONFIRMED", now, note);
      await recordAudit(tx, { organizationId: appointment.organizationId, userId: null }, { action: "APPOINTMENT_ANSWERED_BY_PATIENT", patientId: appointment.patientId, entityId: appointment.id, details: { answer: "CONFIRMED" } });
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
    await recordAudit(tx, { organizationId: appointment.organizationId, userId: null }, { action: "APPOINTMENT_ANSWERED_BY_PATIENT", patientId: appointment.patientId, entityId: appointment.id, details: { answer: "RESCHEDULE_REQUESTED" } });
  });
  return { outcome: "RESCHEDULE_REQUESTED", appointmentId: appointment.id };
}

/** Messages about an appointment that a reply "1" or "2" most likely answers. */
const APPOINTMENT_REMINDER_KINDS: readonly ReminderKind[] = ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H"];
const SUBJECT_WINDOW_MS = 48 * 3_600_000;

/**
 * The appointment a reply is about. When several people share the phone (a parent and children) "the soonest" is a
 * guess, so the appointment of the latest message sent about one wins; "1" prefers one still waiting for
 * confirmation, so repeating it walks through them. Without a recent message the soonest one is used.
 */
async function findSubjectAppointment(prisma: PrismaClient, patientIds: string[], intent: "CONFIRM" | "RESCHEDULE", now: Date) {
  const live = { patientId: { in: patientIds }, status: { in: [...LIVE_STATUSES] }, startsAt: { gt: now }, patient: { doNotContact: false } };
  const recent = await prisma.reminder.findMany({
    where: { status: "SENT", sentAt: { gte: new Date(now.getTime() - SUBJECT_WINDOW_MS) }, kind: { in: [...APPOINTMENT_REMINDER_KINDS] }, appointment: live },
    include: { appointment: true },
    orderBy: { sentAt: "desc" },
  });
  const appointments = recent.flatMap((row) => (row.appointment ? [row.appointment] : []));
  const preferred = intent === "CONFIRM" ? appointments.find((item) => item.status === "SCHEDULED") : undefined;
  const chosen = preferred ?? appointments[0];
  if (chosen) return chosen;
  const waiting = intent === "CONFIRM" ? await prisma.appointment.findFirst({ where: { ...live, status: "SCHEDULED" }, orderBy: { startsAt: "asc" } }) : null;
  return waiting ?? prisma.appointment.findFirst({ where: live, orderBy: { startsAt: "asc" } });
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
    const subject = quoteId
      ? await tx.quote.findUnique({ where: { id: quoteId }, select: { patientId: true } })
      : await tx.appointment.findUnique({ where: { id: appointmentId ?? "" }, select: { patientId: true } });
    await recordAudit(tx, { organizationId, userId: null }, { action: "APPOINTMENT_ANSWERED_BY_PATIENT", patientId: subject?.patientId, entityId: quoteId ?? appointmentId ?? undefined, details: { answer } });
  });
  return quoteId ? { outcome: answer, quoteId } : { outcome: answer, appointmentId: appointmentId ?? undefined };
}

const PLANNED_REMINDER_KINDS = ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H", "NO_SHOW_FOLLOWUP"] as const;

async function optOut(prisma: PrismaClient, organizationId: string, patientIds: string[], now: Date): Promise<InboundOutcome> {
  const newlyOptedOut = await prisma.patient.findMany({ where: { id: { in: patientIds }, doNotContact: false }, select: { id: true } });
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
  for (const patient of newlyOptedOut) {
    await recordAudit(scopedPrisma(prisma, organizationId), { organizationId, userId: null }, { action: "PATIENT_OPTED_OUT", patientId: patient.id, entityId: patient.id });
  }
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
