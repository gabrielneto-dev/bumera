-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PATIENT_CREATED', 'PATIENT_UPDATED', 'PATIENT_CONFIRMED', 'CONSENT_RENEWED', 'PATIENT_OPTED_OUT', 'PATIENT_EXPORTED', 'PATIENT_ANONYMIZED', 'APPOINTMENT_BOOKED', 'APPOINTMENT_STATUS_CHANGED', 'APPOINTMENT_ANSWERED_BY_PATIENT', 'QUOTE_CREATED', 'QUOTE_CLOSED', 'SETTINGS_UPDATED', 'WHATSAPP_CHANGED');

-- CreateEnum
CREATE TYPE "AuditActor" AS ENUM ('USER', 'SYSTEM');

-- AlterTable
ALTER TABLE "patient" ADD COLUMN     "anonymizedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorType" "AuditActor" NOT NULL,
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "patientId" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_organizationId_createdAt_idx" ON "audit_log"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_organizationId_patientId_createdAt_idx" ON "audit_log"("organizationId", "patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The activity log is append-only: a row can never be altered once written (rows only go away with their clinic).
CREATE FUNCTION "audit_log_reject_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows cannot be updated';
END;
$$;
CREATE TRIGGER "audit_log_no_update" BEFORE UPDATE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "audit_log_reject_update"();
