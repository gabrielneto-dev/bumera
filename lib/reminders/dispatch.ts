import type { Prisma, PrismaClient, ReminderKind } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { evaluateGuard, evaluateQuoteGuard, MAX_ATTEMPTS, retryDelayMs } from "@/lib/reminders/guard";
import { isQuietNow, nextDayWindowStart, nextQuietEnd, startOfLocalDay } from "@/lib/reminders/send-window";
import { type ClinicSettings, toClinicSettings } from "@/lib/reminders/settings";
import { firstName, renderReminderMessage } from "@/lib/reminders/messages";

/**
 * Service-to-service side of the reminders (called by n8n through /api/v1, never by a signed-in user).
 * It serves every clinic at once, so it uses the unscoped client on purpose: each row keeps its own
 * organizationId and the payload carries it. Raw SQL is limited to locking row ids.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** A claim nobody reported on for this long is handed out again (n8n crashed or lost the answer). */
const CLAIM_TTL_MS = 10 * 60_000;
const MAX_NOTE_LENGTH = 500;
/** How long a message waits before the app looks again for a clinic whose WhatsApp is not connected. */
const NO_WHATSAPP_RETRY_MS = 30 * 60_000;
/** The claim transaction touches up to MAX_LIMIT rows one by one. */
const TRANSACTION_TIMEOUT_MS = 20_000;

const detailInclude = {
  organization: { select: { id: true, name: true } },
  appointment: {
    include: {
      patient: { select: { id: true, name: true, phoneE164: true, consentAt: true, doNotContact: true, status: true, guardianName: true } },
      dentist: { select: { name: true } },
      procedure: { select: { name: true } },
    },
  },
  quote: {
    include: {
      patient: { select: { id: true, name: true, phoneE164: true, consentAt: true, doNotContact: true, status: true, guardianName: true } },
    },
  },
} satisfies Prisma.ReminderInclude;

type ReminderDetail = Prisma.ReminderGetPayload<{ include: typeof detailInclude }>;

export interface DueReminder {
  id: string;
  kind: ReminderKind;
  /** 1 for the first delivery try, 2+ for retries. */
  attempt: number;
  message: string;
  clinic: { id: string; name: string };
  patient: { id: string; firstName: string; phone: string };
  /** Null for quote follow-ups and their replies. */
  appointment: { id: string; startsAt: string; endsAt: string; dentistName: string; procedureName: string } | null;
  quote: { id: string; description: string } | null;
  /** The clinic's WhatsApp (Evolution) instance n8n must send this message through. */
  whatsapp: { instance: string };
}

export interface ClaimOptions {
  now: Date;
  limit?: number;
}

/** Who the reminder is about: the patient of its appointment or of its quote. */
function patientOf(row: ReminderDetail) {
  const patient = row.appointment?.patient ?? row.quote?.patient;
  if (!patient) throw new AppError("VALIDATION", "Lembrete sem consulta nem orçamento", { id: row.id });
  return patient;
}

function toDue(row: ReminderDetail, attempt: number, instance: string): DueReminder {
  const { appointment, quote } = row;
  const patient = patientOf(row);
  return {
    id: row.id,
    kind: row.kind,
    attempt,
    message: renderReminderMessage({
      kind: row.kind,
      clinicName: row.organization.name,
      patientName: patient.name,
      startsAt: (appointment?.startsAt ?? quote?.createdAt ?? row.createdAt).toISOString(),
      dentistName: appointment?.dentist.name ?? "",
      procedureName: appointment?.procedure.name ?? "",
      quoteDescription: quote?.description,
      guardianName: patient.guardianName ?? undefined,
    }),
    clinic: row.organization,
    patient: { id: patient.id, firstName: firstName(patient.name), phone: patient.phoneE164 },
    appointment: appointment
      ? {
          id: appointment.id,
          startsAt: appointment.startsAt.toISOString(),
          endsAt: appointment.endsAt.toISOString(),
          dentistName: appointment.dentist.name,
          procedureName: appointment.procedure.name,
        }
      : null,
    quote: quote ? { id: quote.id, description: quote.description } : null,
    whatsapp: { instance },
  };
}

/**
 * Locks up to `limit` claimable reminders (due and pending, or claimed too long ago) so concurrent
 * pollers never receive the same one; the locks last until the surrounding transaction ends.
 */
async function lockClaimable(tx: Prisma.TransactionClient, now: Date, limit: number): Promise<string[]> {
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MS);
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "reminder"
    WHERE ("status" = 'PENDING' AND "dueAt" <= ${now})
       OR ("status" = 'CLAIMED' AND "claimedAt" <= ${staleBefore})
    ORDER BY "dueAt" ASC, "id" ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED`;
  return rows.map((row) => row.id);
}

/** The clinics' timings for this batch, and how many messages each already handed over today. */
async function loadSendPolicy(tx: Prisma.TransactionClient, rows: ReminderDetail[], now: Date) {
  const organizationIds = [...new Set(rows.map((row) => row.organizationId))];
  const settingRows = await tx.clinicSettings.findMany({ where: { organizationId: { in: organizationIds } } });
  const settingsByClinic = new Map(settingRows.map((row) => [row.organizationId, toClinicSettings(row)]));
  const instanceByClinic = new Map(settingRows.map((row) => [row.organizationId, row.whatsappInstance]));
  const dayStart = startOfLocalDay(now);
  const counts = await tx.reminder.groupBy({
    by: ["organizationId"],
    where: {
      organizationId: { in: organizationIds },
      OR: [
        { status: "SENT", sentAt: { gte: dayStart } },
        { status: "CLAIMED", claimedAt: { gte: dayStart } },
      ],
    },
    _count: { _all: true },
  });
  const handedOverToday = new Map(counts.map((item) => [item.organizationId, item._count._all]));
  return {
    settingsOf: (organizationId: string): ClinicSettings => settingsByClinic.get(organizationId) ?? toClinicSettings(null),
    instanceOf: (organizationId: string): string | null => instanceByClinic.get(organizationId) ?? null,
    handedOverToday,
  };
}

const byDue = (a: ReminderDetail, b: ReminderDetail): number => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id);

/** Hands due reminders to n8n, marking them claimed. Stale or disallowed ones are closed instead of returned. */
export async function claimDueReminders(prisma: PrismaClient, { now, limit = DEFAULT_LIMIT }: ClaimOptions): Promise<DueReminder[]> {
  const capped = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
  return prisma.$transaction(async (tx) => {
    const ids = await lockClaimable(tx, now, capped);
    if (ids.length === 0) return [];
    const rows = (await tx.reminder.findMany({ where: { id: { in: ids } }, include: detailInclude })).sort(byDue);
    const { settingsOf, instanceOf, handedOverToday } = await loadSendPolicy(tx, rows, now);
    /** Not now: back to pending, due again when sending is allowed. */
    const hold = (id: string, dueAt: Date) =>
      tx.reminder.update({ where: { id }, data: { status: "PENDING", claimedAt: null, dueAt } });

    const due: DueReminder[] = [];
    for (const row of rows) {
      const patient = patientOf(row);
      const settings = settingsOf(row.organizationId);
      const patientHasUpcomingAppointment =
        row.kind === "REACTIVATION"
          ? (await tx.appointment.count({
              where: { patientId: patient.id, status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gt: now } },
            })) > 0
          : undefined;
      const guard =
        row.quote
          ? evaluateQuoteGuard({ quote: row.quote, patient }, now, settings.quoteValidDays)
          : evaluateGuard({ kind: row.kind, appointment: row.appointment ?? undefined, patient, patientHasUpcomingAppointment }, now);
      if (!guard.ok) {
        await tx.reminder.update({ where: { id: row.id }, data: { status: guard.status, note: guard.reason } });
        continue;
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        // n8n kept not reporting back: stop re-sending and let the secretary know.
        await tx.reminder.update({ where: { id: row.id }, data: { status: "FAILED", note: "no delivery result after the last attempt" } });
        continue;
      }
      const instance = instanceOf(row.organizationId);
      if (!instance) {
        // The clinic has no WhatsApp connected: nothing can be sent. Check again later; the message is not lost.
        await hold(row.id, new Date(now.getTime() + NO_WHATSAPP_RETRY_MS));
        continue;
      }
      if (isQuietNow(now, settings)) {
        await hold(row.id, nextQuietEnd(now, settings));
        continue;
      }
      if ((handedOverToday.get(row.organizationId) ?? 0) >= settings.dailySendLimit) {
        await hold(row.id, nextDayWindowStart(now, settings));
        continue;
      }
      const attempt = row.attempts + 1;
      await tx.reminder.update({ where: { id: row.id }, data: { status: "CLAIMED", claimedAt: now, attempts: attempt } });
      handedOverToday.set(row.organizationId, (handedOverToday.get(row.organizationId) ?? 0) + 1);
      due.push(toDue(row, attempt, instance));
    }
    return due;
  }, { timeout: TRANSACTION_TIMEOUT_MS });
}

/** Retrying after this moment is pointless: the appointment started, or the quote expired. */
function retryDeadline(
  row: {
    appointment: { startsAt: Date } | null;
    quote: { createdAt: Date } | null;
  },
  quoteValidDays: number,
): Date {
  if (row.appointment) return row.appointment.startsAt;
  const created = row.quote?.createdAt ?? new Date(0);
  return new Date(created.getTime() + quoteValidDays * 86_400_000);
}

/** `attempt` is the number received in the due payload: a report about an older try is ignored. */
export type ReminderOutcome = { attempt: number } & ({ outcome: "sent" } | { outcome: "failed"; error?: string });

export interface ReminderResult {
  id: string;
  status: ReminderDetail["status"];
}

const truncate = (text: string | undefined): string | null =>
  text ? text.slice(0, MAX_NOTE_LENGTH) : null;

/**
 * Records what n8n reported. Only a claimed reminder changes state; a repeated or late report
 * (already sent, cancelled meanwhile) just returns the current state so n8n can move on.
 */
export async function recordReminderResult(
  prisma: PrismaClient,
  id: string,
  result: ReminderOutcome,
  now: Date,
): Promise<ReminderResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "reminder" WHERE "id" = ${id} FOR UPDATE`;
    if (locked.length === 0) throw new AppError("NOT_FOUND", "Lembrete não encontrado", { resource: "reminder" });

    const row = await tx.reminder.findUniqueOrThrow({
      where: { id },
      include: {
        appointment: { select: { startsAt: true } },
        quote: { select: { createdAt: true } },
      },
    });
    if (row.status !== "CLAIMED" || row.attempts !== result.attempt) return { id, status: row.status };
    const quoteValidDays = row.quote
      ? ((await tx.clinicSettings.findUnique({ where: { organizationId: row.organizationId } }))?.quoteValidDays ?? toClinicSettings(null).quoteValidDays)
      : toClinicSettings(null).quoteValidDays;

    if (result.outcome === "sent") {
      await tx.reminder.update({ where: { id }, data: { status: "SENT", sentAt: now, note: null } });
      return { id, status: "SENT" };
    }

    const delay = retryDelayMs(row.attempts);
    const retryAt = delay === null ? null : new Date(now.getTime() + delay);
    const beforeStart = row.kind === "NO_SHOW_FOLLOWUP" || (retryAt !== null && retryAt < retryDeadline(row, quoteValidDays));
    const note = truncate(result.error) ?? "delivery failed";
    if (retryAt && beforeStart) {
      await tx.reminder.update({ where: { id }, data: { status: "PENDING", dueAt: retryAt, claimedAt: null, note } });
      return { id, status: "PENDING" };
    }
    await tx.reminder.update({ where: { id }, data: { status: "FAILED", note } });
    return { id, status: "FAILED" };
  }, { timeout: TRANSACTION_TIMEOUT_MS });
}

