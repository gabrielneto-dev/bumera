/**
 * Measures how well the configured model reads Portuguese patient messages, so a model is chosen by evidence
 * and not by price alone. Needs OPENROUTER_API_KEY and AI_MODEL (the model under test) in the environment.
 * Usage: npx tsx scripts/ai-eval.ts [path-to-set.json]
 * It sends the labelled messages (already free of real personal data) and prints accuracy, the mistakes and
 * the average latency. No patient data and nothing from the database is used.
 */
import { readFileSync } from "node:fs";
import { getAiClient } from "../lib/ai";
import { maskPersonalData } from "../lib/ai/mask";
import type { AiContext, AiIntent } from "../lib/ai/types";

interface Case {
  message: string;
  context: AiContext;
  expect: AiIntent;
}

const CLINIC_INFO = "Rua das Flores, 100, Centro. Atendemos de segunda a sexta, das 8h às 18h, e aos sábados das 8h às 12h. Aceitamos cartão de crédito, débito e Pix. Há estacionamento conveniado na rua de trás.";

async function main(): Promise<void> {
  const client = getAiClient();
  if (!client) {
    console.error("Defina OPENROUTER_API_KEY e AI_MODEL para avaliar um modelo.");
    process.exit(1);
  }
  const cases = JSON.parse(readFileSync(process.argv[2] ?? new URL("./ai-eval-set.json", import.meta.url), "utf8")) as Case[];
  let correct = 0;
  let totalMs = 0;
  const mistakes: string[] = [];

  for (const item of cases) {
    const started = Date.now();
    try {
      const decision = await client.interpret({ clinicName: "Clínica Exemplo", clinicInfo: CLINIC_INFO, message: maskPersonalData(item.message, ["Maria"]), context: item.context });
      totalMs += Date.now() - started;
      if (decision.intent === item.expect) correct += 1;
      else mistakes.push(`  esperado ${item.expect}, veio ${decision.intent} (${decision.confidence.toFixed(2)}): "${item.message}"`);
    } catch (error) {
      mistakes.push(`  erro (${error instanceof Error ? error.message : "desconhecido"}): "${item.message}"`);
    }
  }
  console.log(`Modelo: ${process.env.AI_MODEL}`);
  console.log(`Acertos: ${correct}/${cases.length} (${Math.round((100 * correct) / cases.length)}%)`);
  console.log(`Latência média: ${Math.round(totalMs / cases.length)} ms`);
  if (mistakes.length) console.log(`Erros:\n${mistakes.join("\n")}`);
}

void main();
