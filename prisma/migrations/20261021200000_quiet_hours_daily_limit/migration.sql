-- AlterTable
ALTER TABLE "clinic_settings" ADD COLUMN     "dailySendLimit" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "quietEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quietEndHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "quietStartHour" INTEGER NOT NULL DEFAULT 21;


ALTER TABLE "clinic_settings" ADD CONSTRAINT "clinic_settings_send_window_check" CHECK (
  "quietStartHour" BETWEEN 0 AND 23 AND "quietEndHour" BETWEEN 0 AND 23
  AND ("quietEnabled" = false OR "quietStartHour" <> "quietEndHour")
  AND "dailySendLimit" BETWEEN 1 AND 1000
);
