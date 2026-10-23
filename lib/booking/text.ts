import { sanitizeName } from "@/lib/reminders/messages";

const MAX_NAME_LENGTH = 80;
const MIN_NAME_LETTERS = 3;
/** Words that say nothing about which procedure someone wants. */
const GENERIC_WORDS = new Set(["dental", "dentes", "dente", "consulta", "tratamento", "geral", "com", "para", "uma", "das", "dos"]);
const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** The menu option a person typed: "1", "*2*", "opção 3", "quero a 2". Null when it is not clearly one digit. */
export function parseChoice(text: string): number | null {
  const normalized = normalize(text).replace(/\*/g, "").trim();
  const direct = /^(?:opcao\s*)?(\d)\s*[.)!]?$/.exec(normalized);
  if (direct?.[1]) return Number(direct[1]);
  const phrased = /\b(?:a|o|numero|opcao)\s+(\d)\b(?!\s*\d)/.exec(normalized);
  return phrased?.[1] ? Number(phrased[1]) : null;
}

const wordsOf = (text: string): string[] => normalize(text).split(/[^a-z0-9]+/).filter(Boolean);

/** The one procedure a free-text message names, or null when none or several match. */
export function matchProcedure(text: string, procedures: ReadonlyArray<{ id: string; name: string }>): string | null {
  const spoken = ` ${wordsOf(text).join(" ")} `;
  const matches = procedures.filter((procedure) => {
    const name = wordsOf(procedure.name);
    if (spoken.includes(` ${name.join(" ")} `)) return true;
    return name.some((word) => word.length >= 5 && !GENERIC_WORDS.has(word) && spoken.includes(` ${word} `));
  });
  return matches.length === 1 && matches[0] ? matches[0].id : null;
}

const BOOKING_VERB = /\b(marcar|agendar|agendamento)\b/;
const ASKS_FOR_SLOT = /\b(tem|ha|existe|teria|tinha)\b.{0,25}\b(horario|vaga)s?\b/;

/** Messages in which someone asks for an appointment, without needing an AI to read them. */
export function looksLikeBookingRequest(text: string): boolean {
  const normalized = normalize(text);
  return BOOKING_VERB.test(normalized) || ASKS_FOR_SLOT.test(normalized);
}

const NAME_PREFIX = /^(?:meu nome (?:é|e|eh)|me chamo|eu sou|sou|aqui (?:é|e|eh)|é|e)\s+(?:(?:o|a)\s+)?/i;

function titleCase(name: string): string {
  return name
    .split(" ")
    .map((word, index) => (index > 0 && NAME_PARTICLES.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

/** A person's name from what they typed, or null when it does not look like one. */
export function cleanName(text: string): string | null {
  const stripped = sanitizeName(text, MAX_NAME_LENGTH * 2).replace(NAME_PREFIX, "").replace(/[.,!;:]+$/g, "").trim();
  if (!stripped || stripped.length > MAX_NAME_LENGTH) return null;
  if (!/^[\p{L}][\p{L} .'’-]*$/u.test(stripped)) return null;
  if ([...stripped].filter((char) => /\p{L}/u.test(char)).length < MIN_NAME_LETTERS) return null;
  if (looksLikeBookingRequest(stripped)) return null;
  const hasBothCases = /\p{Ll}/u.test(stripped) && /\p{Lu}/u.test(stripped);
  return hasBothCases ? stripped : titleCase(stripped);
}
