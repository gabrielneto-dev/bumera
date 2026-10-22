-- CreateEnum
CREATE TYPE "InboundStatus" AS ENUM ('OPEN', 'HANDLED');

-- CreateEnum
CREATE TYPE "InboundReason" AS ENUM ('UNRECOGNIZED', 'URGENT', 'AI_UNSURE', 'AI_UNAVAILABLE', 'AI_ANSWERED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReminderKind" ADD VALUE 'REPLY_HANDOFF';
ALTER TYPE "ReminderKind" ADD VALUE 'REPLY_AI';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'AI_SETTINGS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'INBOUND_MESSAGE_HANDLED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_MESSAGE_ANSWERED_BY_AI';

-- AlterTable
ALTER TABLE "reminder" ADD COLUMN     "inboundMessageId" TEXT,
ADD COLUMN     "text" TEXT;

-- AlterTable
ALTER TABLE "clinic_settings" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiEnabledAt" TIMESTAMP(3),
ADD COLUMN     "aiEnabledBy" TEXT,
ADD COLUMN     "clinicInfo" TEXT;

-- CreateTable
CREATE TABLE "inbound_message" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "text" TEXT,
    "reason" "InboundReason" NOT NULL,
    "status" "InboundStatus" NOT NULL DEFAULT 'OPEN',
    "aiIntent" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_message_organizationId_status_idx" ON "inbound_message"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_message_id_organizationId_key" ON "inbound_message"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_message_organizationId_messageId_key" ON "inbound_message"("organizationId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_inboundMessageId_kind_key" ON "reminder"("inboundMessageId", "kind");

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_inboundMessageId_organizationId_fkey" FOREIGN KEY ("inboundMessageId", "organizationId") REFERENCES "inbound_message"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_message" ADD CONSTRAINT "inbound_message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_message" ADD CONSTRAINT "inbound_message_patientId_organizationId_fkey" FOREIGN KEY ("patientId", "organizationId") REFERENCES "patient"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;


-- A reminder now belongs to exactly one of: an appointment, a quote, or an inbound message.
ALTER TABLE "reminder" DROP CONSTRAINT "reminder_one_subject_check";
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_one_subject_check" CHECK (num_nonnulls("appointmentId", "quoteId", "inboundMessageId") = 1);

-- Free text (AI answers) is bounded. That only REPLY_AI carries it is enforced in the code: a CHECK cannot
-- reference an enum value added by this same migration.
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_text_check" CHECK ("text" IS NULL OR length("text") <= 1000);
