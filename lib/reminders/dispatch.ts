import type { Prisma, PrismaClient, ReminderKind } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { evaluateGuard, MAX_ATTEMPTS, retryDelayMs } from "@/lib/reminders/guard";
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
/** The claim transaction touches up to MAX_LIMIT rows one by one. */
const TRANSACTION_TIMEOUT_MS = 20_000;

const detailInclude = {
  organization: { select: { id: true, name: true } },
  appointment: {
    include: {
      patient: { select: { id: true, name: true, phoneE164: true, consentAt: true, doNotContact: true, status: true } },
      dentist: { select: { name: true } },
      procedure: { select: { name: true } },
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
  appointment: { id: string; startsAt: string; endsAt: string; dentistName: string; procedureName: string };
}

export interface ClaimOptions {
  now: Date;
  limit?: number;
}

function toDue(row: ReminderDetail, attempt: number): DueReminder {
  const { appointment } = row;
  return {
    id: row.id,
    kind: row.kind,
    attempt,
    message: renderReminderMessage({
      kind: row.kind,
      clinicName: row.organization.name,
      patientName: appointment.patient.name,
      startsAt: appointment.startsAt.toISOString(),
      dentistName: appointment.dentist.name,
      procedureName: appointment.procedure.name,
    }),
    clinic: row.organization,
    patient: {
      id: appointment.patient.id,
      firstName: firstName(appointment.patient.name),
      phone: appointment.patient.phoneE164,
    },
    appointment: {
      id: appointment.id,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      dentistName: appointment.dentist.name,
      procedureName: appointment.procedure.name,
    },
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

/** Hands due reminders to n8n, marking them claimed. Stale or disallowed ones are closed instead of returned. */
export async function claimDueReminders(prisma: PrismaClient, { now, limit = DEFAULT_LIMIT }: ClaimOptions): Promise<DueReminder[]> {
  const capped = Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
  return prisma.$transaction(async (tx) => {
    const ids = await lockClaimable(tx, now, capped);
    if (ids.length === 0) return [];
    const rows = await tx.reminder.findMany({
      where: { id: { in: ids } },
      include: detailInclude,
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    });

    const due: DueReminder[] = [];
    for (const row of rows) {
      const guard = evaluateGuard(
        { kind: row.kind, appointment: row.appointment, patient: row.appointment.patient },
        now,
      );
      if (!guard.ok) {
        await tx.reminder.update({ where: { id: row.id }, data: { status: guard.status, note: guard.reason } });
        continue;
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        // n8n kept not reporting back: stop re-sending and let the secretary know.
        await tx.reminder.update({ where: { id: row.id }, data: { status: "FAILED", note: "no delivery result after the last attempt" } });
        continue;
      }
      const attempt = row.attempts + 1;
      await tx.reminder.update({ where: { id: row.id }, data: { status: "CLAIMED", claimedAt: now, attempts: attempt } });
      due.push(toDue(row, attempt));
    }
    return due;
  }, { timeout: TRANSACTION_TIMEOUT_MS });
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
      include: { appointment: { select: { startsAt: true } } },
    });
    if (row.status !== "CLAIMED" || row.attempts !== result.attempt) return { id, status: row.status };

    if (result.outcome === "sent") {
      await tx.reminder.update({ where: { id }, data: { status: "SENT", sentAt: now, note: null } });
      return { id, status: "SENT" };
    }

    const delay = retryDelayMs(row.attempts);
    const retryAt = delay === null ? null : new Date(now.getTime() + delay);
    const beforeStart = row.kind === "NO_SHOW_FOLLOWUP" || (retryAt !== null && retryAt < row.appointment.startsAt);
    const note = truncate(result.error) ?? "delivery failed";
    if (retryAt && beforeStart) {
      await tx.reminder.update({ where: { id }, data: { status: "PENDING", dueAt: retryAt, claimedAt: null, note } });
      return { id, status: "PENDING" };
    }
    await tx.reminder.update({ where: { id }, data: { status: "FAILED", note } });
    return { id, status: "FAILED" };
  }, { timeout: TRANSACTION_TIMEOUT_MS });
}

