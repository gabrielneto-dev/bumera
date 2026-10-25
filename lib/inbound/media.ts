import type { PrismaClient } from "@/generated/prisma/client";
import { isUniqueViolation } from "@/lib/db-errors";
import type { MediaKind } from "@/lib/inbound/evolution";
import { queueReply } from "@/lib/inbound/reply";
import { scopedPrisma } from "@/lib/tenant-scope";

/** What the secretary reads on Pendentes; the media itself stays in WhatsApp. */
const MEDIA_LABEL: Record<MediaKind, string> = {
  audio: "[Áudio]",
  image: "[Imagem]",
  video: "[Vídeo]",
  document: "[Documento]",
};

export interface MediaMessage {
  organizationId: string;
  phoneE164: string;
  messageId: string;
  mediaKind: MediaKind;
}

/**
 * Audio or media without text: nobody (and no AI) can read it here yet, so the person is asked to write and
 * the clinic sees on Pendentes that something arrived. `patientId` is null for a first contact; the reply then
 * goes to the number that wrote. The same delivery repeated is answered once.
 */
export async function receiveMedia(prisma: PrismaClient, message: MediaMessage, patientId: string | null, now: Date): Promise<"MEDIA_RECEIVED" | "IGNORED"> {
  const { organizationId } = message;
  try {
    await scopedPrisma(prisma, organizationId).$transaction(async (tx) => {
      const inbound = await tx.inboundMessage.create({
        data: {
          organizationId,
          patientId,
          phoneE164: patientId ? null : message.phoneE164,
          messageId: message.messageId,
          text: MEDIA_LABEL[message.mediaKind],
          reason: "UNRECOGNIZED",
        },
      });
      await queueReply(tx, { organizationId, inboundMessageId: inbound.id }, "REPLY_MEDIA", now);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "IGNORED";
    throw error;
  }
  return "MEDIA_RECEIVED";
}
