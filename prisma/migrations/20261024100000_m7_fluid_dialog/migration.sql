-- AI calls spent on a conversation: a ceiling per conversation and per clinic per day.
ALTER TABLE "conversation" ADD COLUMN "aiCalls" INTEGER NOT NULL DEFAULT 0;
