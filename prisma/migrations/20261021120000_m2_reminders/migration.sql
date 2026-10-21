-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('CONFIRMATION', 'REMINDER_24H', 'REMINDER_2H', 'NO_SHOW_FOLLOWUP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateTable
CREATE TABLE "reminder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_status_dueAt_idx" ON "reminder"("status", "dueAt");

-- CreateIndex
CREATE INDEX "reminder_organizationId_status_idx" ON "reminder"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_appointmentId_kind_key" ON "reminder"("appointmentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_id_organizationId_key" ON "appointment"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_appointmentId_organizationId_fkey" FOREIGN KEY ("appointmentId", "organizationId") REFERENCES "appointment"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;
