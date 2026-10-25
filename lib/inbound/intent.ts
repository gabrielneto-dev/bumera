export type InboundIntent = "CONFIRM" | "RESCHEDULE" | "OPT_OUT" | "UNKNOWN";

/** Whole-message matches only: a sentence that merely contains a keyword is never acted on. */
const OPT_OUT_WORDS = new Set(["sair", "parar", "pare", "descadastrar", "cancelar mensagens"]);

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads a patient's reply to a reminder: "1" confirm, "2" reschedule, "SAIR" opt out. */
export function parseIntent(text: string): InboundIntent {
  const normalized = normalize(text);
  if (normalized === "1") return "CONFIRM";
  if (normalized === "2") return "RESCHEDULE";
  if (OPT_OUT_WORDS.has(normalized)) return "OPT_OUT";
  return "UNKNOWN";
}
