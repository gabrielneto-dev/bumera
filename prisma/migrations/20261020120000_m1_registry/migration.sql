-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('SECRETARY', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "dentist" ADD COLUMN     "workDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
ADD COLUMN     "workEnd" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "workStart" TEXT NOT NULL DEFAULT '08:00';

-- CreateTable
CREATE TABLE "procedure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDurationMin" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpfEncrypted" TEXT,
    "cpfHash" TEXT,
    "phoneE164" TEXT NOT NULL,
    "birthDate" DATE,
    "status" "PatientStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "RecordSource" NOT NULL DEFAULT 'SECRETARY',
    "consentAt" TIMESTAMP(3),
    "consentSource" TEXT,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" "RecordSource" NOT NULL DEFAULT 'SECRETARY',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procedure_organizationId_idx" ON "procedure"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_id_organizationId_key" ON "procedure"("id", "organizationId");

-- CreateIndex
CREATE INDEX "patient_organizationId_name_idx" ON "patient"("organizationId", "name");

-- CreateIndex
CREATE INDEX "patient_organizationId_phoneE164_idx" ON "patient"("organizationId", "phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "patient_id_organizationId_key" ON "patient"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_organizationId_cpfHash_key" ON "patient"("organizationId", "cpfHash");

-- CreateIndex
CREATE INDEX "appointment_organizationId_startsAt_idx" ON "appointment"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "appointment_dentistId_startsAt_idx" ON "appointment"("dentistId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "dentist_id_organizationId_key" ON "dentist"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patientId_organizationId_fkey" FOREIGN KEY ("patientId", "organizationId") REFERENCES "patient"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_dentistId_organizationId_fkey" FOREIGN KEY ("dentistId", "organizationId") REFERENCES "dentist"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_procedureId_organizationId_fkey" FOREIGN KEY ("procedureId", "organizationId") REFERENCES "procedure"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written rules (Prisma cannot express them)
-- ---------------------------------------------------------------------------

-- An appointment must end after it starts.
ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_ends_after_start" CHECK ("endsAt" > "startsAt");

-- A dentist cannot have two active appointments that overlap in time. Cancelled and
-- no-show appointments free the slot. Ranges are half-open, so back-to-back is allowed.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_no_overlap_per_dentist"
  EXCLUDE USING gist (
    "dentistId" WITH =,
    tsrange("startsAt", "endsAt") WITH &&
  ) WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));
