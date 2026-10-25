-- CreateEnum
CREATE TYPE "AiEventKind" AS ENUM ('TURN_READ', 'TURN_UNSURE', 'TURN_FAILED', 'PHRASE_USED', 'PHRASE_REJECTED', 'PHRASE_FAILED', 'ASIDE_ANSWERED', 'ASIDE_REJECTED');

-- CreateTable
CREATE TABLE "ai_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "AiEventKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_event_organizationId_createdAt_idx" ON "ai_event"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_event" ADD CONSTRAINT "ai_event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
