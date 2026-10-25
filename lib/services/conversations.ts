import { Prisma, type ConversationStep } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { phoneCandidates } from "@/lib/inbound/evolution";
import type { ServiceContext } from "@/lib/services/context";

export type ClearTarget = { patientId: string } | { inboundMessageId: string } | { conversationId: string };

export interface ClearResult {
  conversations: number;
  messages: number;
}

const notFound = (resource: string): AppError => new AppError("NOT_FOUND", "Não encontrado", { resource });

/** The WhatsApp number a patient or an unread message belongs to. */
async function phoneOf(ctx: ServiceContext, target: ClearTarget): Promise<string> {
  if ("patientId" in target) {
    const patient = await ctx.db.patient.findUnique({ where: { id: target.patientId }, select: { phoneE164: true } });
    if (!patient) throw notFound("patient");
    return patient.phoneE164;
  }
  if ("conversationId" in target) {
    const conversation = await ctx.db.conversation.findUnique({ where: { id: target.conversationId }, select: { phoneE164: true } });
    if (!conversation) throw notFound("conversation");
    return conversation.phoneE164;
  }
  const message = await ctx.db.inboundMessage.findUnique({ where: { id: target.inboundMessageId }, include: { patient: { select: { phoneE164: true } } } });
  const phone = message?.patient?.phoneE164 ?? message?.phoneE164;
  if (!phone) throw notFound("inbound_message");
  return phone;
}

/**
 * Starts a WhatsApp conversation over for one number: the booking dialog in progress ends (what it held is erased),
 * replies it had queued but not sent are cancelled, and the unread messages of that number leave the list. The
 * person's next message begins a new conversation from zero. Patient records and appointments are not touched.
 */
export async function clearConversation(ctx: ServiceContext, target: ClearTarget): Promise<ClearResult> {
  assertCan(ctx.role, "patient", "update");
  const phones = phoneCandidates(await phoneOf(ctx, target));
  const now = ctx.now();

  return ctx.db.$transaction(async (tx) => {
    const open = await tx.conversation.findMany({ where: { phoneE164: { in: phones }, status: "OPEN" }, select: { id: true } });
    const conversationIds = open.map((row) => row.id);
    if (conversationIds.length > 0) {
      await tx.conversation.updateMany({ where: { id: { in: conversationIds } }, data: { status: "EXPIRED", name: null, personName: null, slotOptions: Prisma.DbNull } });
      await tx.reminder.updateMany({ where: { conversationId: { in: conversationIds }, status: "PENDING" }, data: { status: "CANCELLED", note: "conversa limpa pela equipe" } });
    }
    const people = await tx.patient.findMany({ where: { phoneE164: { in: phones } }, select: { id: true } });
    const messages = await tx.inboundMessage.updateMany({
      where: { status: "OPEN", OR: [{ phoneE164: { in: phones } }, { patientId: { in: people.map((person) => person.id) } }] },
      data: { status: "HANDLED", handledAt: now, text: null },
    });
    await recordAudit(tx, ctx, { action: "CONVERSATION_CLEARED", patientId: "patientId" in target ? target.patientId : undefined, details: { conversations: conversationIds.length, messages: messages.count } });
    return { conversations: conversationIds.length, messages: messages.count };
  });
}

export interface OpenConversationDto {
  id: string;
  phoneE164: string;
  /** Null for a first contact who is not a patient yet. */
  patientName: string | null;
  step: ConversationStep;
  procedureName: string | null;
  /** The person's answers that did not move the dialog, in a row. */
  misses: number;
  lastActivityAt: string;
}

const OPEN_LIST_LIMIT = 100;

/** The booking dialogs still going on in this clinic, most recent first. Names the dialog holds are not shown. */
export async function listOpenConversations(ctx: ServiceContext): Promise<OpenConversationDto[]> {
  assertCan(ctx.role, "patient", "update");
  const rows = await ctx.db.conversation.findMany({
    where: { status: "OPEN", expiresAt: { gt: ctx.now() } },
    include: { patient: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: OPEN_LIST_LIMIT,
  });
  const procedureIds = [...new Set(rows.flatMap((row) => (row.procedureId ? [row.procedureId] : [])))];
  const procedures = procedureIds.length ? await ctx.db.procedure.findMany({ where: { id: { in: procedureIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(procedures.map((procedure) => [procedure.id, procedure.name]));
  return rows.map((row) => ({
    id: row.id,
    phoneE164: row.phoneE164,
    patientName: row.patient?.name ?? null,
    step: row.step,
    procedureName: row.procedureId ? (names.get(row.procedureId) ?? null) : null,
    misses: row.misses,
    lastActivityAt: row.updatedAt.toISOString(),
  }));
}
