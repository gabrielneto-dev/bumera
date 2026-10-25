-- AlterEnum


ALTER TYPE "ConversationStep" ADD VALUE 'WHO';
ALTER TYPE "ConversationStep" ADD VALUE 'PERSON';

-- AlterTable
ALTER TABLE "patient" ADD COLUMN     "guardianName" TEXT;

-- AlterTable
ALTER TABLE "conversation" ADD COLUMN     "forSelf" BOOLEAN,
ADD COLUMN     "personName" TEXT;

