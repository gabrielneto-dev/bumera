-- CreateTable
CREATE TABLE "clinic_settings" (
    "organizationId" TEXT NOT NULL,
    "confirmationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder1Enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder1HoursBefore" INTEGER NOT NULL DEFAULT 24,
    "reminder2Enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder2HoursBefore" INTEGER NOT NULL DEFAULT 2,
    "noShowEnabled" BOOLEAN NOT NULL DEFAULT true,
    "noShowDelayHours" INTEGER NOT NULL DEFAULT 1,
    "quoteFollowup1Days" INTEGER NOT NULL DEFAULT 2,
    "quoteFollowup2Days" INTEGER NOT NULL DEFAULT 7,
    "quoteValidDays" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "clinic_settings" ADD CONSTRAINT "clinic_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Plausible ranges, enforced at the database too.
ALTER TABLE "clinic_settings" ADD CONSTRAINT "clinic_settings_ranges_check" CHECK (
  "reminder1HoursBefore" BETWEEN 1 AND 168 AND "reminder2HoursBefore" BETWEEN 1 AND 168
  AND "noShowDelayHours" BETWEEN 1 AND 72
  AND "quoteFollowup1Days" BETWEEN 1 AND 30 AND "quoteFollowup2Days" BETWEEN 1 AND 60 AND "quoteValidDays" BETWEEN 1 AND 90
);
