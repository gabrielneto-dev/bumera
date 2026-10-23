import type { PrismaClient } from "@/generated/prisma/client";
import { resolveAiClient } from "@/lib/ai";
import type { AiClient, AiContext, AiDecision } from "@/lib/ai/types";
import { maskPersonalData } from "@/lib/ai/mask";
import { recordAudit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import type { InboundOutcome, ReplyIntent } from "@/lib/inbound/handle";
import { queueReply } from "@/lib/inbound/reply";
import { looksLikeInjection } from "@/lib/inbound/injection";
import { isUrgent } from "@/lib/inbound/urgent";
import { sanitizeParagraphs } from "@/lib/reminders/messages";
import { startOfLocalDay } from "@/lib/reminders/send-window";
import { scopedPrisma } from "@/lib/tenant-scope";

const MAX_TEXT_LENGTH = 1000;
const MAX_AI_MESSAGE_LENGTH = 600;
/** AI calls per clinic per local day: a cost and abuse ceiling, not a feature limit. */
const AI_DAILY_LIMIT = 100;
/** How sure the model must be before the app acts for the patient. Stopping messages needs the most. */
const ACT_CONFIDENCE: Record<"YES" | "NO" | "STOP", number> = { YES: 0.85, NO: 0.85, STOP: 0.9 };
const ANSWER_CONFIDENCE = 0.8;
const INTENT_BY_AI: Record<"YES" | "NO" | "STOP", ReplyIntent> = { YES: "CONFIRM", NO: "RESCHEDULE", STOP: "OPT_OUT" };

export interface FreeTextMessage {
  organizationId: string;
  messageId: string;
  text: string;
}

export interface FreeTextHelpers {
  /** Set only in tests; normally the client is built from the clinic's saved key. */
  ai?: AiClient | null;
  /** Does what a keyword reply would have done. */
  apply: (intent: ReplyIntent) => Promise<InboundOutcome>;
  context: () => Promise<AiContext>;
}

/**
 * A message from a known patient that no keyword explains. It is kept for the secretary and acknowledged,
 * unless the clinic opted in to the AI assistant and the AI is sure: then it acts for the patient (yes, no,
 * stop) or answers a question from the clinic's own information. Urgent messages never go to the AI.
 * The same delivery repeated (same message id) is recognized and ignored.
 */
export async function receiveFreeText(
  prisma: PrismaClient,
  message: FreeTextMessage,
  patientId: string,
  now: Date,
  helpers: FreeTextHelpers,
): Promise<InboundOutcome> {
  const { organizationId } = message;
  const db = scopedPrisma(prisma, organizationId);
  const urgent = isUrgent(message.text);

  let inboundId: string;
  try {
    inboundId = (
      await db.inboundMessage.create({
        data: { organizationId, patientId, messageId: message.messageId, text: message.text.slice(0, MAX_TEXT_LENGTH), reason: urgent ? "URGENT" : "UNRECOGNIZED" },
      })
    ).id;
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "IGNORED" };
    throw error;
  }

  const handOff = async (reason: "UNRECOGNIZED" | "URGENT" | "AI_UNSURE" | "AI_UNAVAILABLE", aiIntent?: string): Promise<InboundOutcome> => {
    await db.$transaction(async (tx) => {
      await tx.inboundMessage.update({ where: { id: inboundId }, data: { reason, ...(aiIntent ? { aiIntent } : {}) } });
      await queueReply(tx, { organizationId, inboundMessageId: inboundId }, "REPLY_HANDOFF", now);
    });
    return { outcome: "HANDOFF" };
  };
  if (urgent) return handOff("URGENT");
  // Text that talks to the AI itself goes to a person without being sent to the model.
  if (looksLikeInjection(message.text)) return handOff("UNRECOGNIZED");

  const decision = await askAi(prisma, message, patientId, now, helpers);
  if (decision === "unavailable") return handOff("AI_UNAVAILABLE");
  if (decision === "off") return handOff("UNRECOGNIZED");

  const finish = (aiIntent: string) =>
    db.$transaction(async (tx) => {
      await tx.inboundMessage.update({ where: { id: inboundId }, data: { status: "HANDLED", handledAt: now, text: null, reason: "AI_ANSWERED", aiIntent } });
      await recordAudit(tx, { organizationId, userId: null }, { action: "PATIENT_MESSAGE_ANSWERED_BY_AI", patientId, entityId: inboundId, details: { intent: aiIntent } });
    });

  if (decision.intent === "YES" || decision.intent === "NO" || decision.intent === "STOP") {
    if (decision.confidence < ACT_CONFIDENCE[decision.intent]) return handOff("AI_UNSURE", decision.intent);
    const outcome = await helpers.apply(INTENT_BY_AI[decision.intent]);
    // Nothing to confirm or reschedule: a person should read it.
    if (outcome.outcome === "NO_APPOINTMENT") return handOff("AI_UNSURE", decision.intent);
    await finish(decision.intent);
    return outcome;
  }

  if (decision.intent === "QUESTION") {
    const answer = sanitizeParagraphs(decision.answer ?? "");
    if (decision.confidence < ANSWER_CONFIDENCE || !answer) return handOff("AI_UNSURE", "QUESTION");
    await db.$transaction(async (tx) => {
      await queueReply(tx, { organizationId, inboundMessageId: inboundId }, "REPLY_AI", now, answer);
    });
    await finish("QUESTION");
    return { outcome: "ANSWERED_BY_AI" };
  }
  return handOff("AI_UNSURE", "OTHER");
}

/** Asks the AI, or says why it was not asked ("off") or could not answer ("unavailable"). */
async function askAi(
  prisma: PrismaClient,
  message: FreeTextMessage,
  patientId: string,
  now: Date,
  helpers: FreeTextHelpers,
): Promise<AiDecision | "off" | "unavailable"> {
  const { organizationId } = message;
  const settings = await prisma.clinicSettings.findUnique({ where: { organizationId } });
  if (!settings?.aiEnabled) return "off";
  const encryptionKey = process.env.CPF_ENCRYPTION_KEY;
  const ai = helpers.ai !== undefined ? helpers.ai : encryptionKey ? resolveAiClient({ encryptedKey: settings.aiApiKeyEncrypted, encryptionKey }) : null;
  if (!ai) return "off";

  const usedToday = await prisma.inboundMessage.count({
    where: { organizationId, aiIntent: { not: null }, createdAt: { gte: startOfLocalDay(now) } },
  });
  if (usedToday >= AI_DAILY_LIMIT) return "off";

  const [clinic, patient] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { name: true } }),
  ]);
  try {
    return await ai.interpret({
      clinicName: clinic.name,
      clinicInfo: settings.clinicInfo ?? "",
      message: maskPersonalData(message.text, [patient.name]).slice(0, MAX_AI_MESSAGE_LENGTH),
      context: await helpers.context(),
    });
  } catch {
    return "unavailable";
  }
}
