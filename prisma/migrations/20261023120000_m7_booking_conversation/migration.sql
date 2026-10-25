-- CreateEnum
CREATE TYPE "ConversationStep" AS ENUM ('PROCEDURE', 'NAME', 'SLOT', 'CONFIRM');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'DONE', 'HANDED_OFF', 'EXPIRED');

-- AlterEnum
ALTER TYPE "ReminderKind" ADD VALUE 'REPLY_FLOW';

-- AlterTable
ALTER TABLE "reminder" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "replyToMessageId" TEXT;

-- AlterTable
ALTER TABLE "clinic_settings" ADD COLUMN     "bookingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "inbound_message" ADD COLUMN     "phoneE164" TEXT,
ALTER COLUMN "patientId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "patientId" TEXT,
    "step" "ConversationStep" NOT NULL DEFAULT 'PROCEDURE',
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "procedureId" TEXT,
    "name" TEXT,
    "slotOptions" JSONB,
    "slotOffset" INTEGER NOT NULL DEFAULT 0,
    "chosenStartsAt" TIMESTAMP(3),
    "chosenDentistId" TEXT,
    "misses" INTEGER NOT NULL DEFAULT 0,
    "lastMessageId" TEXT,
    "appointmentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_organizationId_status_idx" ON "conversation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "conversation_status_expiresAt_idx" ON "conversation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_id_organizationId_key" ON "conversation"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_conversationId_replyToMessageId_key" ON "reminder"("conversationId", "replyToMessageId");

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_conversationId_organizationId_fkey" FOREIGN KEY ("conversationId", "organizationId") REFERENCES "conversation"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_patientId_organizationId_fkey" FOREIGN KEY ("patientId", "organizationId") REFERENCES "patient"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;


-- A reminder belongs to exactly one of: an appointment, a quote, an inbound message or a conversation.
ALTER TABLE "reminder" DROP CONSTRAINT "reminder_one_subject_check";
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_one_subject_check" CHECK (num_nonnulls("appointmentId", "quoteId", "inboundMessageId", "conversationId") = 1);

-- An inbound message is about a patient or, for a first contact, about a phone number.
ALTER TABLE "inbound_message" ADD CONSTRAINT "inbound_message_who_check" CHECK ("patientId" IS NOT NULL OR "phoneE164" IS NOT NULL);

-- One open conversation per phone number and clinic.
CREATE UNIQUE INDEX "conversation_one_open_per_phone" ON "conversation"("organizationId", "phoneE164") WHERE "status" = 'OPEN';
