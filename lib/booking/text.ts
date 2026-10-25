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

const FOR_OTHER = /\b(filh[oa]s?|esposa|marido|mulher|namorad[oa]|mae|pai|irma[oa]?|irmao|neto|neta|sobrinh[oa]|prim[oa]|tio|tia|avo|avos|amig[oa]|outra pessoa|outro paciente|pra ele|pra ela|para ele|para ela)\b/;
const FOR_SELF = /\b(para mim|pra mim|eu mesm[oa]|e pra mim|sou eu|para eu)\b/;

/** Whether a message says the appointment is for the writer ("self") or for someone else ("other"); null if unsaid. */
export function detectWhom(text: string): "self" | "other" | null {
  const normalized = normalize(text);
  if (FOR_OTHER.test(normalized)) return "other";
  return FOR_SELF.test(normalized) ? "self" : null;
}

const GREETING_WORDS = new Set(["oi", "oii", "oiii", "oie", "ola", "opa", "eae", "e", "ai", "bom", "boa", "dia", "tarde", "noite", "tudo", "bem", "td", "tranquilo", "hey", "hello", "salve", "fala", "como", "vai", "voce", "vcs", "ola"]);
const GREETING_CORE = new Set(["oi", "oii", "oiii", "oie", "ola", "opa", "eae", "bom", "boa", "hey", "hello", "salve", "tudo", "td"]);
const MAX_GREETING_WORDS = 5;

/** A message that only says hello ("Oi", "Olá, boa noite", "tudo bem?"): nothing is being asked yet. */
export function isGreeting(text: string): boolean {
  const words = wordsOf(text);
  if (words.length === 0 || words.length > MAX_GREETING_WORDS) return false;
  return words.every((word) => GREETING_WORDS.has(word)) && words.some((word) => GREETING_CORE.has(word));
}

const RESET_COMMAND = /^(recomecar|reiniciar|comecar de novo|comecar novamente|limpar conversa|reiniciar conversa|recomecar conversa)\W*$/;

/** The person asks to start the conversation over ("recomeçar", "limpar conversa"). */
export function isResetCommand(text: string): boolean {
  return RESET_COMMAND.test(normalize(text).trim());
}

const AFFIRMATION_WORDS = new Set(["sim", "pode", "ser", "claro", "quero", "ok", "okay", "beleza", "bora", "vamos", "isso", "mesmo", "certo", "fechado", "com", "certeza", "combinado", "ta", "bom", "aceito", "topo", "por", "favor", "gostaria", "otimo", "perfeito", "uhum", "aham", "pode", "sim"]);
const AFFIRMATION_CORE = new Set(["sim", "pode", "claro", "quero", "ok", "okay", "beleza", "bora", "vamos", "isso", "certo", "fechado", "certeza", "combinado", "aceito", "topo", "uhum", "aham", "gostaria"]);
const MAX_AFFIRMATION_WORDS = 5;

/** A message that only says yes ("pode ser", "sim, quero", "claro!"), to what the clinic just proposed. */
export function isAffirmation(text: string): boolean {
  const words = wordsOf(text);
  if (words.length === 0 || words.length > MAX_AFFIRMATION_WORDS) return false;
  return words.every((word) => AFFIRMATION_WORDS.has(word)) && words.some((word) => AFFIRMATION_CORE.has(word));
}
