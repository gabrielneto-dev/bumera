import type { ScopedPrisma } from "@/lib/tenant-scope";

export type ReplyKind =
  | "REPLY_CONFIRMED"
  | "REPLY_RESCHEDULE"
  | "REPLY_OPTED_OUT"
  | "REPLY_INTERESTED"
  | "REPLY_DECLINED"
  | "REPLY_HANDOFF"
  | "REPLY_AI"
  | "REPLY_FLOW";
type ReplyDb = Pick<ScopedPrisma, "reminder">;
/** What a reply is about: an appointment, a quote or a patient's own message, inside one clinic. */
export type ReplySubject = { organizationId: string } & ({ appointmentId: string } | { quoteId: string } | { inboundMessageId: string });

/**
 * Queues the automatic answer, due immediately, for n8n to pick up through /due. One per
 * (subject, kind): a patient answering twice, or a webhook delivered twice, gets one reply.
 * `text` is only for REPLY_AI; every other kind is rendered from a fixed template.
 */
export async function queueReply(db: ReplyDb, subject: ReplySubject, kind: ReplyKind, now: Date, text?: string): Promise<void> {
  const { organizationId } = subject;
  const body = text === undefined ? {} : { text };
  if ("appointmentId" in subject) {
    const { appointmentId } = subject;
    await db.reminder.upsert({
      where: { appointmentId_kind: { appointmentId, kind } },
      update: {},
      create: { organizationId, appointmentId, kind, dueAt: now, ...body },
    });
    return;
  }
  if ("quoteId" in subject) {
    const { quoteId } = subject;
    await db.reminder.upsert({
      where: { quoteId_kind: { quoteId, kind } },
      update: {},
      create: { organizationId, quoteId, kind, dueAt: now, ...body },
    });
    return;
  }
  const { inboundMessageId } = subject;
  await db.reminder.upsert({
    where: { inboundMessageId_kind: { inboundMessageId, kind } },
    update: {},
    create: { organizationId, inboundMessageId, kind, dueAt: now, ...body },
  });
}

/** One turn of the booking conversation, answering one inbound message (a repeated delivery is answered once). */
export async function queueFlowReply(
  db: ReplyDb,
  turn: { organizationId: string; conversationId: string; replyToMessageId: string; text: string },
  now: Date,
): Promise<void> {
  const { organizationId, conversationId, replyToMessageId, text } = turn;
  await db.reminder.upsert({
    where: { conversationId_replyToMessageId: { conversationId, replyToMessageId } },
    update: {},
    create: { organizationId, conversationId, replyToMessageId, kind: "REPLY_FLOW", dueAt: now, text },
  });
}
