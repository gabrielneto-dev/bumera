import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { guidance } from "@/app/(app)/qualidade-ia/labels";
import { recordAiEvent } from "@/lib/ai/events";
import { createPrismaClient } from "@/lib/prisma";
import { getAiQuality, parsePeriod, percent, type AiQuality } from "@/lib/services/ai-quality";
import { createClinic } from "../helpers/factories";
import { ctxFor, NOW } from "../helpers/service-context";

const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const DAY = 86_400_000;

describe("AI quality", () => {
  let clinic: string;
  let other: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    other = await createClinic(prisma, "b");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const conversation = (organizationId: string, data: { status: "OPEN" | "DONE" | "HANDED_OFF" | "EXPIRED"; step?: "SLOT" | "WHO"; aiCalls?: number; createdAt?: Date }) =>
    prisma.conversation.create({
      data: { organizationId, phoneE164: `+5511${Math.floor(Math.random() * 1e9)}`, step: data.step ?? "PROCEDURE", status: data.status, aiCalls: data.aiCalls ?? 0, expiresAt: new Date(NOW.getTime() + DAY), createdAt: data.createdAt ?? new Date(NOW.getTime() - DAY) },
    });

  it("counts conversations, where they stall and the calls spent, only for this clinic and period", async () => {
    await conversation(clinic, { status: "DONE", aiCalls: 4 });
    await conversation(clinic, { status: "DONE", aiCalls: 6 });
    await conversation(clinic, { status: "HANDED_OFF", step: "SLOT", aiCalls: 3 });
    await conversation(clinic, { status: "HANDED_OFF", step: "WHO" });
    await conversation(clinic, { status: "EXPIRED" });
    await conversation(clinic, { status: "OPEN" });
    await conversation(clinic, { status: "DONE", createdAt: new Date(NOW.getTime() - 40 * DAY) });
    await conversation(other, { status: "DONE", aiCalls: 99 });

    const quality = await getAiQuality(ctxFor(prisma, clinic, "admin"), 30);

    expect(quality.conversations).toMatchObject({ started: 6, done: 2, handedOff: 2, expired: 1, open: 1 });
    expect(quality.conversations.handedOffByStep).toMatchObject({ SLOT: 1, WHO: 1, PROCEDURE: 0 });
    expect(quality.aiCalls).toBe(13);
    expect((await getAiQuality(ctxFor(prisma, clinic, "admin"), 90)).conversations.started).toBe(7);
  });

  it("counts what the AI read and wrote, and what became of free-text messages", async () => {
    for (const kind of ["TURN_READ", "TURN_READ", "TURN_UNSURE", "TURN_FAILED", "PHRASE_USED", "PHRASE_REJECTED", "ASIDE_ANSWERED"] as const) {
      await prisma.aiEvent.create({ data: { organizationId: clinic, kind, createdAt: new Date(NOW.getTime() - DAY) } });
    }
    await prisma.aiEvent.create({ data: { organizationId: other, kind: "PHRASE_FAILED", createdAt: new Date(NOW.getTime() - DAY) } });
    const patient = await prisma.patient.create({ data: { organizationId: clinic, name: "Maria", phoneE164: "+5511900000001" } });
    for (const [index, reason] of (["AI_ANSWERED", "AI_UNSURE", "URGENT", "UNRECOGNIZED"] as const).entries()) {
      await prisma.inboundMessage.create({ data: { organizationId: clinic, patientId: patient.id, messageId: `m${index}`, reason, aiIntent: reason === "AI_ANSWERED" ? "QUESTION" : null, createdAt: new Date(NOW.getTime() - DAY) } });
    }

    const quality = await getAiQuality(ctxFor(prisma, clinic, "admin"), 7);

    expect(quality.reading).toEqual({ read: 2, unsure: 1, failed: 1 });
    expect(quality.writing).toEqual({ used: 1, rejected: 1, failed: 0 });
    expect(quality.aside).toEqual({ answered: 1, rejected: 0 });
    expect(quality.freeText).toEqual({ total: 4, answeredByAi: 1, sentToSecretary: 1, aiUnsure: 1, aiUnavailable: 0, urgent: 1 });
    expect(quality.aiCalls).toBe(1);
  });

  it("is for the administrator only", async () => {
    await expect(getAiQuality(ctxFor(prisma, clinic, "secretary"), 30)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("never lets a counting failure reach the conversation", async () => {
    await expect(recordAiEvent(prisma, "no-such-clinic", "TURN_READ")).resolves.toBeUndefined();
  });

  it("parses the period and shares", () => {
    expect([parsePeriod("7"), parsePeriod("90"), parsePeriod("5"), parsePeriod(undefined)]).toEqual([7, 90, 30, 30]);
    expect([percent(1, 4), percent(0, 0)]).toEqual([25, null]);
  });

  describe("guidance", () => {
    const base: AiQuality = {
      days: 30,
      conversations: { started: 0, done: 0, handedOff: 0, expired: 0, open: 0, handedOffByStep: { PROCEDURE: 0, WHO: 0, PERSON: 0, NAME: 0, SLOT: 0, CONFIRM: 0 } },
      freeText: { total: 0, answeredByAi: 0, sentToSecretary: 0, aiUnsure: 0, aiUnavailable: 0, urgent: 0 },
      reading: { read: 0, unsure: 0, failed: 0 },
      writing: { used: 0, rejected: 0, failed: 0 },
      aside: { answered: 0, rejected: 0 },
      aiCalls: 0,
    };

    it("says nothing with little data", () => {
      expect(guidance({ ...base, writing: { used: 1, rejected: 3, failed: 0 } })).toEqual([]);
    });

    it("points at rejected writing, provider failures, hand-offs and side answers", () => {
      const lines = guidance({
        ...base,
        writing: { used: 6, rejected: 6, failed: 0 },
        reading: { read: 0, unsure: 0, failed: 1 },
        conversations: { ...base.conversations, started: 10, handedOff: 5 },
        aside: { answered: 1, rejected: 4 },
      });
      expect(lines).toHaveLength(4);
      expect(lines.join(" ")).toMatch(/texto fixo/);
      expect(lines.join(" ")).toMatch(/chave da OpenRouter/);
    });
  });
});
