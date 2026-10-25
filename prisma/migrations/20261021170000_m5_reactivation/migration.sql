-- AlterEnum
ALTER TYPE "ReminderKind" ADD VALUE 'REACTIVATION';
ALTER TYPE "ReminderKind" ADD VALUE 'REPLY_INTERESTED';
ALTER TYPE "ReminderKind" ADD VALUE 'REPLY_DECLINED';

-- CreateEnum
CREATE TYPE "ReminderAnswer" AS ENUM ('INTERESTED', 'DECLINED');

-- AlterTable
ALTER TABLE "procedure" ADD COLUMN "reactivateAfterMonths" INTEGER;
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_reactivate_after_months_check" CHECK ("reactivateAfterMonths" IS NULL OR ("reactivateAfterMonths" BETWEEN 1 AND 60));

-- AlterTable
ALTER TABLE "reminder" ADD COLUMN "answer" "ReminderAnswer", ADD COLUMN "answeredAt" TIMESTAMP(3), ADD COLUMN "handledAt" TIMESTAMP(3);
