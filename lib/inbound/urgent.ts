/** Words that suggest pain or an emergency: such a message must reach a person quickly, whatever else happens. */
const URGENT_PATTERNS: readonly RegExp[] = [
  /\bdor(es)?\b/,
  /\bsangr\w*/,
  /\binchad\w*|\binchaco\b/,
  /\bfebre\b/,
  /\burgen\w*|\bemergenc\w*/,
  /\bquebr(ei|ou|ado)\b/,
  /\babscess\w*|\bpus\b/,
  /\bacidente\b|\bcai(u|i)\b/,
  /\bnao consigo (respirar|engolir|abrir)/,
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function isUrgent(text: string): boolean {
  const normalized = normalize(text);
  return URGENT_PATTERNS.some((pattern) => pattern.test(normalized));
}
