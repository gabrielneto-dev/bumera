-- Messages held for a few seconds so several in a row are answered once.
CREATE TABLE "inbound_buffer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_buffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_buffer_receivedAt_idx" ON "inbound_buffer"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_buffer_organizationId_messageId_key" ON "inbound_buffer"("organizationId", "messageId");

-- AddForeignKey
ALTER TABLE "inbound_buffer" ADD CONSTRAINT "inbound_buffer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
