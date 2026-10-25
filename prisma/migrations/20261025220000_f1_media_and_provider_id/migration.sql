-- AI phase F1: media notice reply, media kind in the inbound buffer, WhatsApp id of sent messages.
ALTER TYPE "ReminderKind" ADD VALUE 'REPLY_MEDIA';

ALTER TABLE "inbound_buffer" ADD COLUMN "mediaKind" TEXT;

ALTER TABLE "reminder" ADD COLUMN "providerMessageId" TEXT;
