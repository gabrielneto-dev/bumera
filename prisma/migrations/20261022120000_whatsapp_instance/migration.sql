-- AlterTable
ALTER TABLE "clinic_settings" ADD COLUMN     "whatsappInstance" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clinic_settings_whatsappInstance_key" ON "clinic_settings"("whatsappInstance");
