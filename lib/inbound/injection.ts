/**
 * Messages that read like instructions to the AI itself. A patient never needs to write these, so such a message
 * is not sent to the model at all: it goes to the secretary. This does not replace the model's own resistance
 * (and the thresholds), it only removes the cheapest attacks before anything is spent.
 */
const PATTERNS: readonly RegExp[] = [
  /\bintent\b/,
  /\bconfidence\b/,
  /\bjson\b/,
  /\bsystem prompt\b|\bprompt\b/,
  /\bignor(e|ar|em)\b.{0,30}\b(instruc\w*|regras?|anterior\w*|acima|tudo)\b/,
  /\besquec\w*\b.{0,20}\b(tudo|instruc\w*|regras?)\b/,
  /\bvoce (agora )?e (um|uma)\b/,
  /\bfinja\b|\bhaja como\b|\batue como\b/,
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function looksLikeInjection(text: string): boolean {
  const normalized = normalize(text);
  return PATTERNS.some((pattern) => pattern.test(normalized));
}
