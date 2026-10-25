import type { ConversationStep } from "@/generated/prisma/client";
import { percent, type AiQuality } from "@/lib/services/ai-quality";

export const STEP_LABEL: Record<ConversationStep, string> = {
  PROCEDURE: "Escolher o procedimento",
  WHO: "Para quem é a consulta",
  PERSON: "Nome do paciente",
  NAME: "Nome de quem escreve",
  SLOT: "Escolher o horário",
  CONFIRM: "Confirmar o pedido",
};

/** Few samples say nothing: below this many, no advice is given. */
const MIN_SAMPLE = 10;
const HIGH_REJECTION_PERCENT = 20;
const HIGH_HANDOFF_PERCENT = 40;

/** Plain-language things worth a look, only when there is enough data to say so. */
export function guidance(quality: AiQuality): string[] {
  const lines: string[] = [];
  const written = quality.writing.used + quality.writing.rejected + quality.writing.failed;
  const rejection = percent(quality.writing.rejected + quality.writing.failed, written);
  if (written >= MIN_SAMPLE && rejection !== null && rejection >= HIGH_REJECTION_PERCENT) {
    lines.push(`${rejection}% das perguntas escritas pela IA foram trocadas pelo texto fixo. Vale rodar a avaliação do diálogo (scripts/ai-dialog-eval.ts) antes de mudar de modelo.`);
  }
  if (quality.reading.failed + quality.writing.failed + quality.freeText.aiUnavailable > 0) {
    lines.push("Houve falhas de comunicação com a IA. Confira se a chave da OpenRouter ainda é válida e se há crédito na conta.");
  }
  const handoff = percent(quality.conversations.handedOff, quality.conversations.started);
  if (quality.conversations.started >= MIN_SAMPLE && handoff !== null && handoff >= HIGH_HANDOFF_PERCENT) {
    lines.push(`${handoff}% das conversas passaram para a secretária. Veja em qual etapa elas travam.`);
  }
  if (quality.aside.rejected > quality.aside.answered && quality.aside.rejected >= 3) {
    lines.push("Muitas respostas a perguntas laterais foram reprovadas. Talvez faltem informações da clínica na tela Assistente.");
  }
  return lines;
}
