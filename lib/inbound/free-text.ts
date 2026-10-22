import type { PrismaClient } from "@/generated/prisma/client";
import { isUniqueViolation } from "@/lib/db-errors";
import { isUrgent } from "@/lib/inbound/urgent";
import { queueReply } from "@/lib/inbound/reply";
import { scopedPrisma } from "@/lib/tenant-scope";

const MAX_TEXT_LENGTH = 1000;

export type FreeTextOutcome = { outcome: "HANDOFF" } | { outcome: "IGNORED" };

export interface FreeTextMessage {
  organizationId: string;
  messageId: string;
  text: string;
}

/**
 * A message from a known patient that no keyword explains: keep it for the secretary and acknowledge it.
 * The same delivery repeated (same message id) is recognized and ignored.
 */
export async function receiveFreeText(
  prisma: PrismaClient,
  message: FreeTextMessage,
  patientId: string,
  now: Date,
): Promise<FreeTextOutcome> {
  const { organizationId } = message;
  try {
    await scopedPrisma(prisma, organizationId).$transaction(async (tx) => {
      const row = await tx.inboundMessage.create({
        data: {
          organizationId,
          patientId,
          messageId: message.messageId,
          text: message.text.slice(0, MAX_TEXT_LENGTH),
          reason: isUrgent(message.text) ? "URGENT" : "UNRECOGNIZED",
        },
      });
      await queueReply(tx, { organizationId, inboundMessageId: row.id }, "REPLY_HANDOFF", now);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "IGNORED" };
    throw error;
  }
  return { outcome: "HANDOFF" };
}
