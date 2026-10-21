-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED');
-- AlterEnum
ALTER TYPE "ReminderKind" ADD VALUE 'QUOTE_FOLLOWUP_1';
ALTER TYPE "ReminderKind" ADD VALUE 'QUOTE_FOLLOWUP_2';
-- AlterTable
ALTER TABLE "reminder" ADD COLUMN     "quoteId" TEXT,
ALTER COLUMN "appointmentId" DROP NOT NULL;
-- CreateTable
CREATE TABLE "quote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "valueCents" INTEGER,
    "status" "QuoteStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "quote_organizationId_status_idx" ON "quote"("organizationId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "quote_id_organizationId_key" ON "quote"("id", "organizationId");
-- CreateIndex
CREATE UNIQUE INDEX "reminder_quoteId_kind_key" ON "reminder"("quoteId", "kind");
-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_quoteId_organizationId_fkey" FOREIGN KEY ("quoteId", "organizationId") REFERENCES "quote"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_patientId_organizationId_fkey" FOREIGN KEY ("patientId", "organizationId") REFERENCES "patient"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- A quote value is a plausible amount in cents (at most R$ 99.999,99).
ALTER TABLE "quote" ADD CONSTRAINT "quote_value_cents_check" CHECK ("valueCents" IS NULL OR ("valueCents" >= 0 AND "valueCents" <= 9999999));

-- A reminder belongs to exactly one subject: an appointment or a quote.
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_one_subject_check" CHECK (("appointmentId" IS NULL) <> ("quoteId" IS NULL));
