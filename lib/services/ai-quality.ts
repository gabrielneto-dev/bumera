import type { AiEventKind, ConversationStep } from "@/generated/prisma/client";
import { assertCan } from "@/lib/authz";
import type { ServiceContext } from "@/lib/services/context";

export const QUALITY_PERIODS = [7, 30, 90] as const;
export type QualityPeriod = (typeof QUALITY_PERIODS)[number];
const DAY_MS = 86_400_000;

export interface AiQuality {
  days: QualityPeriod;
  conversations: { started: number; done: number; handedOff: number; expired: number; open: number; handedOffByStep: Record<ConversationStep, number> };
  /** Messages from known patients that no keyword explained, by what became of them. */
  freeText: { total: number; answeredByAi: number; sentToSecretary: number; aiUnsure: number; aiUnavailable: number; urgent: number };
  /** The AI reading a free answer in the booking dialog. */
  reading: { read: number; unsure: number; failed: number };
  /** The AI writing the dialog's questions: used as written, or replaced by the fixed text. */
  writing: { used: number; rejected: number; failed: number };
  aside: { answered: number; rejected: number };
  /** Model calls spent: in booking conversations plus messages read for intent. */
  aiCalls: number;
}

const STEPS: readonly ConversationStep[] = ["PROCEDURE", "WHO", "PERSON", "NAME", "SLOT", "CONFIRM"];

export function parsePeriod(value: string | undefined): QualityPeriod {
  const days = Number(value);
  return (QUALITY_PERIODS as readonly number[]).includes(days) ? (days as QualityPeriod) : 30;
}

/** How the AI is doing for this clinic over the last `days` days (administrator only). Counts, never text or people. */
export async function getAiQuality(ctx: ServiceContext, days: QualityPeriod): Promise<AiQuality> {
  assertCan(ctx.role, "triggerRule", "read");
  const since = new Date(ctx.now().getTime() - days * DAY_MS);
  const [conversationRows, stepRows, calls, inboundRows, eventRows, intentCalls] = await Promise.all([
    ctx.db.conversation.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    ctx.db.conversation.groupBy({ by: ["step"], where: { createdAt: { gte: since }, status: "HANDED_OFF" }, _count: { _all: true } }),
    ctx.db.conversation.aggregate({ where: { createdAt: { gte: since } }, _sum: { aiCalls: true } }),
    ctx.db.inboundMessage.groupBy({ by: ["reason"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    ctx.db.aiEvent.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    ctx.db.inboundMessage.count({ where: { createdAt: { gte: since }, aiIntent: { not: null } } }),
  ]);

  const byStatus = new Map(conversationRows.map((row) => [row.status, row._count._all]));
  const byStep = new Map(stepRows.map((row) => [row.step, row._count._all]));
  const byReason = new Map(inboundRows.map((row) => [row.reason, row._count._all]));
  const events = new Map<AiEventKind, number>(eventRows.map((row) => [row.kind, row._count._all]));
  const count = (kind: AiEventKind): number => events.get(kind) ?? 0;
  const status = (name: "OPEN" | "DONE" | "HANDED_OFF" | "EXPIRED"): number => byStatus.get(name) ?? 0;

  return {
    days,
    conversations: {
      started: [...byStatus.values()].reduce((sum, value) => sum + value, 0),
      done: status("DONE"),
      handedOff: status("HANDED_OFF"),
      expired: status("EXPIRED"),
      open: status("OPEN"),
      handedOffByStep: Object.fromEntries(STEPS.map((step) => [step, byStep.get(step) ?? 0])) as Record<ConversationStep, number>,
    },
    freeText: {
      total: [...byReason.values()].reduce((sum, value) => sum + value, 0),
      answeredByAi: byReason.get("AI_ANSWERED") ?? 0,
      sentToSecretary: byReason.get("UNRECOGNIZED") ?? 0,
      aiUnsure: byReason.get("AI_UNSURE") ?? 0,
      aiUnavailable: byReason.get("AI_UNAVAILABLE") ?? 0,
      urgent: byReason.get("URGENT") ?? 0,
    },
    reading: { read: count("TURN_READ"), unsure: count("TURN_UNSURE"), failed: count("TURN_FAILED") },
    writing: { used: count("PHRASE_USED"), rejected: count("PHRASE_REJECTED"), failed: count("PHRASE_FAILED") },
    aside: { answered: count("ASIDE_ANSWERED"), rejected: count("ASIDE_REJECTED") },
    aiCalls: (calls._sum.aiCalls ?? 0) + intentCalls,
  };
}

/** A share as a whole percentage, or null when there is nothing to divide. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
