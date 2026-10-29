import type { PrismaClient, ReminderKind } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { phoneCandidates } from "@/lib/phone";
import { type AnswerKind, renderAnswerMessage } from "@/lib/reminders/messages";
import { toClinicSettings } from "@/lib/reminders/settings";
import { syncQuoteReminders, syncReminders } from "@/lib/reminders/sync";
import { scopedPrisma } from "@/lib/tenant-scope";

/**
 * What a patient's answer does, decided by the app; the n8n workflow reads the message (by keyword or AI) and
 * sends back `reply` (CTX-DEC-20261026-whatsapp-in-n8n). Every answer acts only inside the clinic whose number
 * received it, and is safe to repeat.
 */

export type PatientAnswer = "CONFIRM" | "RESCHEDULE" | "OPT_OUT";

export type AnswerOutcome = "CONFIRMED" | "RESCHEDULE_REQUESTED" | "INTERESTED" | "DECLINED" | "OPTED_OUT" | "NO_APPOINTMENT" | "UNKNOWN_PATIENT";

export interface AnswerResult {
  outcome: AnswerOutcome;
  appointmentId?: string;
  quoteId?: string;
  /** Text for the workflow to send to the patient; null when there is nothing to say. */
  reply: string | null;
}

export interface AnswerInput {
  organizationId: string;
  phoneE164: string;
  answer: PatientAnswer;
}

const LIVE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;
const PLANNED_REMINDER_KINDS = ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H", "NO_SHOW_FOLLOWUP"] as const;
/** Messages about an appointment that a "1" or "2" most likely answers. */
const APPOINTMENT_REMINDER_KINDS: readonly ReminderKind[] = ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H"];
const SUBJECT_WINDOW_MS = 48 * 3_600_000;
const CAMPAIGN_KINDS: readonly ReminderKind[] = ["REACTIVATION", "QUOTE_FOLLOWUP_1", "QUOTE_FOLLOWUP_2"];
/** A campaign message keeps meaning "1 / 2" for this long; after that the replies are read as usual. */
const CAMPAIGN_WINDOW_MS = 14 * 24 * 3_600_000;

const detailInclude = {
  patient: { select: { name: true, guardianName: true } },
  dentist: { select: { name: true } },
  procedure: { select: { name: true } },
  organization: { select: { name: true } },
} as const;

function replyFor(kind: AnswerKind, subject: { clinicName: string; patientName: string; guardianName: string | null; startsAt?: Date; dentistName?: string; procedureName?: string }, note?: string): string {
  return renderAnswerMessage({
    kind,
    clinicName: subject.clinicName,
    patientName: subject.patientName,
    startsAt: (subject.startsAt ?? new Date()).toISOString(),
    dentistName: subject.dentistName ?? "",
    procedureName: subject.procedureName ?? "",
    guardianName: subject.guardianName ?? undefined,
    freeText: note,
  });
}

export async function applyPatientAnswer(prisma: PrismaClient, { organizationId, phoneE164, answer }: AnswerInput, now: Date): Promise<AnswerResult> {
  const patients = await prisma.patient.findMany({
    where: { organizationId, phoneE164: { in: phoneCandidates(phoneE164) }, anonymizedAt: null },
    select: { id: true, name: true, guardianName: true },
    orderBy: { createdAt: "asc" },
  });
  if (patients.length === 0) return { outcome: "UNKNOWN_PATIENT", reply: null };
  const patientIds = patients.map((patient) => patient.id);
  if (answer === "OPT_OUT") return optOut(prisma, organizationId, patients, now);

  const campaign = await openCampaignMessage(prisma, patientIds, now);
  if (campaign) return answerCampaign(prisma, campaign, answer === "CONFIRM" ? "INTERESTED" : "DECLINED", now);

  const appointment = await findSubjectAppointment(prisma, organizationId, patientIds, answer, now);
  if (!appointment) return { outcome: "NO_APPOINTMENT", reply: null };
  const subject = {
    clinicName: appointment.organization.name,
    patientName: appointment.patient.name,
    guardianName: appointment.patient.guardianName,
    startsAt: appointment.startsAt,
    dentistName: appointment.dentist.name,
    procedureName: appointment.procedure.name,
  };
  const db = scopedPrisma(prisma, organizationId);

  if (answer === "CONFIRM") {
    const settings = toClinicSettings(await db.clinicSettings.findUnique({ where: { organizationId } }));
    const others = await db.$transaction(async (tx) => {
      if (appointment.status !== "CONFIRMED") {
        const row = await tx.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED" } });
        await syncReminders(tx, row, now, settings);
      }
      await recordAudit(tx, { organizationId, userId: null }, { action: "APPOINTMENT_ANSWERED_BY_PATIENT", patientId: appointment.patientId, entityId: appointment.id, details: { answer: "CONFIRMED" } });
      return tx.appointment.count({ where: { patientId: { in: patientIds }, status: "SCHEDULED", startsAt: { gt: now }, NOT: { id: appointment.id } } });
    });
    const note = others > 0 ? `Ainda há ${others} ${others === 1 ? "consulta aguardando" : "consultas aguardando"} confirmação: responda 1 de novo para confirmar a próxima.` : undefined;
    return { outcome: "CONFIRMED", appointmentId: appointment.id, reply: replyFor("REPLY_CONFIRMED", subject, note) };
  }

  await db.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointment.id }, data: { rescheduleRequestedAt: now } });
    await tx.reminder.updateMany({
      where: { appointmentId: appointment.id, status: "PENDING", kind: { in: [...PLANNED_REMINDER_KINDS] } },
      data: { status: "CANCELLED", note: "patient asked to reschedule" },
    });
    await recordAudit(tx, { organizationId, userId: null }, { action: "APPOINTMENT_ANSWERED_BY_PATIENT", patientId: appointment.patientId, entityId: appointment.id, details: { answer: "RESCHEDULE_REQUESTED" } });
  });
  return { outcome: "RESCHEDULE_REQUESTED", appointmentId: appointment.id, reply: replyFor("REPLY_RESCHEDULE", subject) };
}

/**
 * The appointment an answer is about. When several people share the phone (a parent and children) "the soonest" is
 * a guess, so the appointment of the latest message sent about one wins; "1" prefers one still waiting for
 * confirmation, so repeating it walks through them. Without a recent message the soonest one is used.
 */
async function findSubjectAppointment(prisma: PrismaClient, organizationId: string, patientIds: string[], answer: "CONFIRM" | "RESCHEDULE", now: Date) {
  const live = { organizationId, patientId: { in: patientIds }, status: { in: [...LIVE_STATUSES] }, startsAt: { gt: now }, patient: { doNotContact: false } };
  const recent = await prisma.reminder.findMany({
    where: { status: "SENT", sentAt: { gte: new Date(now.getTime() - SUBJECT_WINDOW_MS) }, kind: { in: [...APPOINTMENT_REMINDER_KINDS] }, appointment: live },
    select: { appointmentId: true },
    orderBy: { sentAt: "desc" },
  });
  const ids = recent.flatMap((row) => (row.appointmentId ? [row.appointmentId] : []));
  const candidates = ids.length > 0 ? await prisma.appointment.findMany({ where: { id: { in: ids } }, include: detailInclude }) : [];
  const ordered = ids.map((id) => candidates.find((item) => item.id === id)).filter((item) => item !== undefined);
  const chosen = (answer === "CONFIRM" ? ordered.find((item) => item.status === "SCHEDULED") : undefined) ?? ordered[0];
  if (chosen) return chosen;
  const waiting = answer === "CONFIRM" ? await prisma.appointment.findFirst({ where: { ...live, status: "SCHEDULED" }, include: detailInclude, orderBy: { startsAt: "asc" } }) : null;
  return waiting ?? prisma.appointment.findFirst({ where: live, include: detailInclude, orderBy: { startsAt: "asc" } });
}

/**
 * The campaign message the patient is most likely answering: the latest message sent to them, when it was a
 * campaign one, is still unanswered and recent. Appointment reminders sent after it win.
 */
export async function openCampaignMessage(prisma: PrismaClient, patientIds: string[], now: Date) {
  const latest = await prisma.reminder.findFirst({
    where: { status: "SENT", sentAt: { not: null }, OR: [{ appointment: { patientId: { in: patientIds } } }, { quote: { patientId: { in: patientIds } } }] },
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
): Promise<AnswerResult> {
  const { appointmentId, quoteId, organizationId } = campaign;
  const subject = await scopedPrisma(prisma, organizationId).$transaction(async (tx) => {
    await tx.reminder.update({ where: { id: campaign.id }, data: { answer, answeredAt: now } });
    if (quoteId && answer === "DECLINED") {
      // "Not now" closes the quote: no more follow-ups.
      const quote = await tx.quote.update({ where: { id: quoteId }, data: { status: "DECLINED", closedAt: now } });
      await syncQuoteReminders(tx, quote, now);
    }
    const owner = quoteId
      ? await tx.quote.findUnique({ where: { id: quoteId }, select: { patientId: true, patient: { select: { name: true, guardianName: true } } } })
      : await tx.appointment.findUnique({ where: { id: appointmentId ?? "" }, select: { patientId: true, patient: { select: { name: true, guardianName: true } } } });
    await recordAudit(tx, { organizationId, userId: null }, { action: "APPOINTMENT_ANSWERED_BY_PATIENT", patientId: owner?.patientId, entityId: quoteId ?? appointmentId ?? undefined, details: { answer } });
    return owner;
  });
  const clinic = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  const reply = replyFor(answer === "INTERESTED" ? "REPLY_INTERESTED" : "REPLY_DECLINED", {
    clinicName: clinic.name,
    patientName: subject?.patient.name ?? "",
    guardianName: subject?.patient.guardianName ?? null,
  });
  return quoteId ? { outcome: answer, quoteId, reply } : { outcome: answer, appointmentId: appointmentId ?? undefined, reply };
}

async function optOut(prisma: PrismaClient, organizationId: string, patients: Array<{ id: string; name: string; guardianName: string | null }>, now: Date): Promise<AnswerResult> {
  const patientIds = patients.map((patient) => patient.id);
  const db = scopedPrisma(prisma, organizationId);
  await db.$transaction(async (tx) => {
    const newlyOptedOut = await tx.patient.findMany({ where: { id: { in: patientIds }, doNotContact: false }, select: { id: true } });
    await tx.patient.updateMany({ where: { id: { in: patientIds }, doNotContact: false }, data: { doNotContact: true, optedOutAt: now } });
    await tx.reminder.updateMany({
      where: { status: "PENDING", OR: [{ appointment: { patientId: { in: patientIds } } }, { quote: { patientId: { in: patientIds } } }] },
      data: { status: "SKIPPED", note: "patient opted out" },
    });
    for (const patient of newlyOptedOut) {
      await recordAudit(tx, { organizationId, userId: null }, { action: "PATIENT_OPTED_OUT", patientId: patient.id, entityId: patient.id });
    }
  });
  const clinic = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  // The adult who owns the phone is the one greeted.
  const owner = patients.find((patient) => patient.guardianName === null) ?? patients[0];
  return { outcome: "OPTED_OUT", reply: replyFor("REPLY_OPTED_OUT", { clinicName: clinic.name, patientName: owner?.name ?? "", guardianName: null }) };
}
