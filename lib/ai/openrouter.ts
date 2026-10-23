import { z } from "zod";
import { buildMessages, buildProcedureMessages, type ChatMessage } from "@/lib/ai/prompt";
import type { AiClient, AiDecision, AiInput, AiProcedureChoice, AiProcedureInput } from "@/lib/ai/types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_OUTPUT_TOKENS = 300;

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

const procedureSchema = z.object({
  choice: z.number().int().min(1).nullable(),
  confidence: z.number().min(0).max(1),
});

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
  async function ask(messages: ChatMessage[]): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Bumera" },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: "json_object" },
          provider: { data_collection: "deny" },
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
    async pickProcedure(input: AiProcedureInput): Promise<AiProcedureChoice> {
      const parsed = procedureSchema.safeParse(await ask(buildProcedureMessages(input)));
      if (!parsed.success) throw new AiError("A resposta do modelo não segue o formato esperado");
      return parsed.data;
    },
  };
}
