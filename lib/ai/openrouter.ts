import { z } from "zod";
import { buildMessages, buildPhraseMessages, buildTurnMessages, type ChatMessage } from "@/lib/ai/prompt";
import type { SlotPreference, AiClient, AiDecision, AiInput, AiPhraseInput, AiTurn, AiTurnInput } from "@/lib/ai/types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_OUTPUT_TOKENS = 400;
/** A little variety in the wording; the extraction calls stay at 0. */
const PHRASE_TEMPERATURE = 0.5;

export class AiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiError";
  }
}

const decisionSchema = z.object({
  intent: z.enum(["YES", "NO", "STOP", "QUESTION", "BOOK", "OTHER"]),
  confidence: z.number().min(0).max(1),
  answer: z.string().nullable().optional().transform((value) => value ?? null),
});

function normalizePreference(value: { weekdays?: number[] | null; period?: "morning" | "afternoon" | null; fromHour?: number | null } | null | undefined): SlotPreference | null {
  if (!value) return null;
  const weekdays = value.weekdays?.length ? [...new Set(value.weekdays)] : undefined;
  const period = value.period ?? undefined;
  const fromHour = value.fromHour ?? undefined;
  return weekdays || period || fromHour !== undefined ? { weekdays, period, fromHour } : null;
}

const turnSchema = z.object({
  procedure: z.number().int().min(1).nullable().optional().transform((value) => value ?? null),
  whom: z.enum(["self", "other"]).nullable().optional().transform((value) => value ?? null),
  slot: z.union([z.number().int().min(1), z.literal("more")]).nullable().optional().transform((value) => value ?? null),
  prefer: z
    .object({
      weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
      period: z.enum(["morning", "afternoon"]).nullable().optional(),
      fromHour: z.number().int().min(0).max(23).nullable().optional(),
    })
    .nullable()
    .optional()
    .transform((value) => normalizePreference(value)),
  confirm: z.enum(["yes", "no"]).nullable().optional().transform((value) => value ?? null),
  human: z.boolean().optional().transform((value) => value ?? false),
  answer: z.string().nullable().optional().transform((value) => value ?? null),
  confidence: z.number().min(0).max(1),
});

const phraseSchema = z.object({ reply: z.string().min(1) });

/** Models sometimes wrap JSON in a code fence: take what is between the first "{" and the last "}". */
function extractJson(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AiError("A resposta do modelo não é JSON");
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch (error) {
    throw new AiError("A resposta do modelo não é JSON válido", { cause: error });
  }
}

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

/**
 * Asks a model on OpenRouter to read one patient message. `data_collection: "deny"` asks the provider not to
 * keep or train on the request. Any failure becomes an `AiError`, which the caller treats as "ask a person".
 */
export function createOpenRouterClient({ apiKey, model, timeoutMs = DEFAULT_TIMEOUT_MS }: OpenRouterOptions): AiClient {
  async function ask(messages: ChatMessage[], temperature = 0): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Bumera" },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: "json_object" },
          provider: { data_collection: "deny" },
          // Reasoning models would spend the whole token budget thinking and cut the JSON short.
          reasoning: { enabled: false },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AiError("Não foi possível falar com o provedor de IA", { cause: error });
    }
    if (!response.ok) throw new AiError(`O provedor de IA respondeu ${response.status}`);

    const body: unknown = await response.json().catch(() => null);
    const content = (body as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new AiError("O provedor de IA não devolveu uma resposta");
    return extractJson(content);
  }

  return {
    async interpret(input: AiInput): Promise<AiDecision> {
      const parsed = decisionSchema.safeParse(await ask(buildMessages(input)));
      if (!parsed.success) throw new AiError("A resposta do modelo não segue o formato esperado");
      return parsed.data;
    },
    async understandTurn(input: AiTurnInput): Promise<AiTurn> {
      const parsed = turnSchema.safeParse(await ask(buildTurnMessages(input)));
      if (!parsed.success) throw new AiError("A resposta do modelo não segue o formato esperado");
      return parsed.data;
    },
    async phrase(input: AiPhraseInput): Promise<string> {
      const parsed = phraseSchema.safeParse(await ask(buildPhraseMessages(input), PHRASE_TEMPERATURE));
      if (!parsed.success) throw new AiError("A resposta do modelo não segue o formato esperado");
      return parsed.data.reply;
    },
  };
}
