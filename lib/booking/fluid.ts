import type { AiTurn, PhraseGoal } from "@/lib/ai/types";

/** How sure the model must be before the dialog acts on what it read. */
export const TURN_CONFIDENCE = 0.8;
const MAX_REPLY_LENGTH = 700;
const MAX_ANSWER_LENGTH = 400;
const PATIENT_PLACEHOLDER = "{{PACIENTE}}";
const URL_LIKE = /https?:\/\/|www\.|\b[\w-]+\.(com|net|org|br)\b/i;
const DIGIT_RUNS = /\d+/g;

const CONTROL_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]+/g;

/**
 * Text written by a model, made safe for WhatsApp: no control characters or stray markup, lines kept (the list of
 * times), at most one blank line between paragraphs. WhatsApp bold (*like this*) stays when the asterisks pair up.
 * Null when it carries a link, which a model must never add.
 */
function cleanMessage(raw: string, maxLength: number): string | null {
  if (URL_LIKE.test(raw)) return null;
  const lines = raw
    .replace(CONTROL_CHARS, " ")
    .replace(/[_~`]/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLength).trim();
  const balanced = (text.match(/\*/g) ?? []).length % 2 === 0;
  return balanced ? text : text.replace(/\*/g, "");
}

/** The fields of a reading that are sure enough to act on. */
export function trusted(turn: AiTurn | null): AiTurn | null {
  return turn && turn.confidence >= TURN_CONFIDENCE ? turn : null;
}

export interface PhraseCheck {
  goal: PhraseGoal;
  /** Texts that must appear exactly (the times). */
  required: readonly string[];
  /** The patient's name as it may be written; null when the message must not mention one. */
  person: string | null;
  /** Everything the model was told: a number that is in none of it was invented. */
  material: readonly string[];
}

/**
 * Checks a message the model wrote before it reaches a person: it must carry the real times, invent no
 * numbers, carry no links, promise nothing the clinic did not, and say what the step needs it to say.
 * Returns the cleaned text, with the patient's name filled in, or null when it cannot be sent.
 */
export function validatePhrase(raw: string, check: PhraseCheck): string | null {
  const text = cleanMessage(raw, MAX_REPLY_LENGTH);
  if (!text) return null;
  if (check.required.some((piece) => !text.includes(piece))) return null;

  const placeholders = text.split(PATIENT_PLACEHOLDER).length - 1;
  if (placeholders > 0 && !check.person) return null;
  const filled = check.person ? text.split(PATIENT_PLACEHOLDER).join(check.person) : text;
  if (filled.includes("{{") || filled.includes("}}")) return null;

  // Every number in the message must come from what we gave: the times, the procedures, the clinic.
  const given = new Set([...check.required, ...check.material].join(" ").match(DIGIT_RUNS) ?? []);
  if ((text.match(DIGIT_RUNS) ?? []).some((digits) => !given.has(digits))) return null;

  const lowered = filled.toLowerCase();
  if (check.goal === "confirm" && !lowered.includes("lembrete")) return null;
  if (check.goal === "requested" && (!lowered.includes("equipe") || /confirmad[oa]/.test(lowered))) return null;
  return filled;
}

/** The model's answer to a side question: short, linkless, and with no number the clinic did not write. */
export function validateAnswer(raw: string | null, clinicInfo: string): string | null {
  if (!raw) return null;
  const text = cleanMessage(raw, MAX_ANSWER_LENGTH);
  if (!text || text.includes("{{")) return null;
  const known = new Set(clinicInfo.match(DIGIT_RUNS) ?? []);
  const unknown = (text.match(DIGIT_RUNS) ?? []).some((digits) => !known.has(digits));
  return unknown ? null : text;
}
