/**
 * Measures how well candidate models read Portuguese patient messages, so a model is chosen by evidence and
 * not by price alone. The set holds invented messages (no real patient data).
 *
 * Usage (the key is read from the environment or, with --from-db, from the clinic's saved encrypted key):
 *   npx tsx scripts/ai-eval.ts --models provider/model-a,provider/model-b [--from-db] [--set path.json]
 * With --from-db it needs DATABASE_URL and CPF_ENCRYPTION_KEY; the key is used in memory and never printed.
 */
import { readFileSync } from "node:fs";
import { createOpenRouterClient } from "../lib/ai/openrouter";
import { maskPersonalData } from "../lib/ai/mask";
import type { AiContext, AiIntent } from "../lib/ai/types";
import { decryptField } from "../lib/crypto";

interface Case {
  message: string;
  context: AiContext;
  expect: AiIntent;
}

const CLINIC_INFO =
  "Rua das Flores, 100, Centro. Atendemos de segunda a sexta, das 8h às 18h, e aos sábados das 8h às 12h. Aceitamos cartão de crédito, débito e Pix. Há estacionamento conveniado na rua de trás.";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function loadKey(): Promise<string> {
  if (process.argv.includes("--from-db")) {
    const { createPrismaClient } = await import("../lib/prisma");
    const prisma = createPrismaClient(process.env.DATABASE_URL as string);
    const row = await prisma.clinicSettings.findFirst({ where: { aiApiKeyEncrypted: { not: null } } });
    await prisma.$disconnect();
    if (!row?.aiApiKeyEncrypted) throw new Error("Nenhuma clínica tem chave salva.");
    return decryptField(row.aiApiKeyEncrypted, process.env.CPF_ENCRYPTION_KEY as string);
  }
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Defina OPENROUTER_API_KEY ou use --from-db.");
  return process.env.OPENROUTER_API_KEY;
}

async function evaluate(apiKey: string, model: string, cases: Case[]): Promise<void> {
  const client = createOpenRouterClient({ apiKey, model, timeoutMs: 20_000 });
  let correct = 0;
  let succeeded = 0;
  let totalMs = 0;
  const mistakes: string[] = [];
  for (const item of cases) {
    const started = Date.now();
    try {
      const decision = await client.interpret({ clinicName: "Clínica Exemplo", clinicInfo: CLINIC_INFO, message: maskPersonalData(item.message, ["Maria"]), context: item.context });
      totalMs += Date.now() - started;
      succeeded += 1;
      if (decision.intent === item.expect) correct += 1;
      else mistakes.push(`    esperado ${item.expect}, veio ${decision.intent} (${decision.confidence.toFixed(2)}): "${item.message}"`);
    } catch (error) {
      mistakes.push(`    erro (${error instanceof Error ? error.message : "desconhecido"}): "${item.message}"`);
    }
  }
  const pct = Math.round((100 * correct) / cases.length);
  const latency = succeeded ? Math.round(totalMs / succeeded) : 0;
  console.log(`\n${model}\n  acertos ${correct}/${cases.length} (${pct}%) | respostas ${succeeded}/${cases.length} | latência média ${latency} ms`);
  if (mistakes.length) console.log(mistakes.join("\n"));
}

async function main(): Promise<void> {
  const models = (argument("--models") ?? process.env.AI_MODEL ?? "").split(",").map((model) => model.trim()).filter(Boolean);
  if (models.length === 0) throw new Error("Informe --models modelo-a,modelo-b");
  const cases = JSON.parse(readFileSync(argument("--set") ?? new URL("./ai-eval-set.json", import.meta.url), "utf8")) as Case[];
  const apiKey = await loadKey();
  for (const model of models) await evaluate(apiKey, model, cases);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
