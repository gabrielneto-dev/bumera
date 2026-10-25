import { vi } from "vitest";
import type { AiClient, AiDecision, AiInput, AiPhraseInput, AiTurn, AiTurnInput } from "@/lib/ai/types";

const NOTHING: AiTurn = { procedure: null, whom: null, slot: null, prefer: null, confirm: null, human: false, answer: null, confidence: 0.95 };

export interface FakeAi extends AiClient {
  calls: AiInput[];
  turnCalls: AiTurnInput[];
  phraseCalls: AiPhraseInput[];
}

/**
 * A scripted AI. `turn` is what it reads from booking messages (a function can answer per call), `phrase` what it
 * writes (default: an Error, so the fixed texts are used). Passing an Error makes that call fail.
 */
export function fakeAi(
  decision: AiDecision | Error = { intent: "OTHER", confidence: 0.9, answer: null },
  options: { turn?: Partial<AiTurn> | Error | ((input: AiTurnInput) => Partial<AiTurn>); phrase?: string | Error | ((input: AiPhraseInput) => string) } = {},
): FakeAi {
  const calls: AiInput[] = [];
  const turnCalls: AiTurnInput[] = [];
  const phraseCalls: AiPhraseInput[] = [];
  return {
    calls,
    turnCalls,
    phraseCalls,
    interpret: vi.fn(async (input: AiInput) => {
      calls.push(input);
      if (decision instanceof Error) throw decision;
      return decision;
    }),
    understandTurn: vi.fn(async (input: AiTurnInput) => {
      turnCalls.push(input);
      const turn = options.turn;
      if (turn instanceof Error) throw turn;
      return { ...NOTHING, ...(typeof turn === "function" ? turn(input) : turn) };
    }),
    phrase: vi.fn(async (input: AiPhraseInput) => {
      phraseCalls.push(input);
      const phrase = options.phrase;
      if (phrase === undefined) throw new Error("no phrase scripted");
      if (phrase instanceof Error) throw phrase;
      return typeof phrase === "function" ? phrase(input) : phrase;
    }),
  };
}
