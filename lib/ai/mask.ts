import { isValidCpf } from "@/lib/cpf";

/** Letters that may appear with or without an accent, so "Jose" finds "José". */
const ACCENT_CLASSES: Record<string, string> = {
  a: "[aáàâãä]",
  e: "[eéèêë]",
  i: "[iíìîï]",
  o: "[oóòôõö]",
  u: "[uúùûü]",
  c: "[cç]",
};

const MIN_NAME_PART = 3;
const CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;
const PHONE = /(?<![\d])(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}(?![\d])/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function accentInsensitive(token: string): string {
  return [...token.normalize("NFD").replace(/[̀-ͯ]/g, "")]
    .map((char) => ACCENT_CLASSES[char.toLowerCase()] ?? escapeRegex(char))
    .join("");
}

function nameRegex(pattern: string): RegExp {
  return new RegExp(`(?<![\\p{L}])${pattern}(?![\\p{L}])`, "giu");
}

/**
 * Removes what identifies the patient before a message leaves for the AI provider: CPFs, phone numbers,
 * e-mail addresses and the patient's own name (whole, then each part of three letters or more).
 * What remains is the question or answer itself.
 */
export function maskPersonalData(text: string, names: readonly string[]): string {
  // Eleven bare digits can be a phone or a CPF: a valid CPF check digit decides which label it gets.
  const asPhone = (match: string): string => (isValidCpf(match.replace(/\D/g, "")) ? "[CPF]" : "[TELEFONE]");
  let masked = text.replace(EMAIL, "[EMAIL]").replace(PHONE, asPhone).replace(CPF, "[CPF]");
  const phrases = names.map((name) => name.trim()).filter(Boolean);
  const parts = phrases.flatMap((name) => name.split(/\s+/)).filter((part) => part.length >= MIN_NAME_PART);
  for (const phrase of phrases.sort((a, b) => b.length - a.length)) {
    masked = masked.replace(nameRegex(phrase.split(/\s+/).map(accentInsensitive).join("\\s+")), "[NOME]");
  }
  for (const part of parts.sort((a, b) => b.length - a.length)) {
    masked = masked.replace(nameRegex(accentInsensitive(part)), "[NOME]");
  }
  return masked;
}
