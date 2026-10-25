import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { phoneCandidates } from "@/lib/inbound/evolution";
import type { ServiceContext } from "@/lib/services/context";

export type ClearTarget = { patientId: string } | { inboundMessageId: string };

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
