-- The WhatsApp conversation moves to n8n (CTX-DEC-20261026-whatsapp-in-n8n): the app keeps the agenda, the reminder
-- rules and an API. Conversation data, the worker's queue, automatic-reply reminders and the AI settings go away.

-- Worker queue (pg-boss), created outside Prisma by the F1 worker.
DROP SCHEMA IF EXISTS "pgboss" CASCADE;

-- Reminders that were answers to a patient's own message (sent by the old pipeline).
DELETE FROM "reminder" WHERE "kind"::text LIKE 'REPLY_%' OR "inboundMessageId" IS NOT NULL OR "conversationId" IS NOT NULL;
ALTER TABLE "reminder" DROP CONSTRAINT "reminder_one_subject_check";
ALTER TABLE "reminder" DROP CONSTRAINT IF EXISTS "reminder_text_check";
ALTER TABLE "reminder"
  DROP COLUMN "inboundMessageId",
  DROP COLUMN "conversationId",
  DROP COLUMN "replyToMessageId",
  DROP COLUMN "text",
  DROP COLUMN "providerMessageId";
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_one_subject_check" CHECK (("appointmentId" IS NULL) <> ("quoteId" IS NULL));

-- Postgres cannot drop enum values: recreate the type without the REPLY_* kinds.
ALTER TYPE "ReminderKind" RENAME TO "ReminderKind_old";
CREATE TYPE "ReminderKind" AS ENUM ('CONFIRMATION', 'REMINDER_24H', 'REMINDER_2H', 'NO_SHOW_FOLLOWUP', 'REACTIVATION', 'QUOTE_FOLLOWUP_1', 'QUOTE_FOLLOWUP_2');
ALTER TABLE "reminder" ALTER COLUMN "kind" TYPE "ReminderKind" USING ("kind"::text::"ReminderKind");
DROP TYPE "ReminderKind_old";

-- Conversation data (booking dialog, inbox, buffer, AI counters).
DROP TABLE "ai_event";
DROP TABLE "inbound_buffer";
DROP TABLE "conversation";
DROP TABLE "inbound_message";
DROP TYPE "AiEventKind";
DROP TYPE "ConversationStep";
DROP TYPE "ConversationStatus";
DROP TYPE "InboundStatus";
DROP TYPE "InboundReason";

-- The AI now lives in n8n with its own credentials; the clinic's information text and the booking switch stay.
ALTER TABLE "clinic_settings"
  DROP COLUMN "aiEnabled",
  DROP COLUMN "aiEnabledAt",
  DROP COLUMN "aiEnabledBy",
  DROP COLUMN "aiApiKeyEncrypted",
  DROP COLUMN "aiApiKeyLast4";
