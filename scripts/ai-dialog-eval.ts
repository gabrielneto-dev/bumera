/**
 * Measures the fluid booking dialog against a real model: does it read free answers correctly, and is what it
 * writes accepted by the app's validation? Invented messages only (no real patient data).
 *
 * Usage: npx tsx scripts/ai-dialog-eval.ts --models provider/model [--from-db]
 * (key as in ai-eval.ts: OPENROUTER_API_KEY, or --from-db with DATABASE_URL and CPF_ENCRYPTION_KEY)
 */
import { createOpenRouterClient } from "../lib/ai/openrouter";
import type { AiPhraseInput, AiTurn, AiTurnInput } from "../lib/ai/types";
import { validatePhrase } from "../lib/booking/fluid";
import { decryptField } from "../lib/crypto";

const INFO = "Rua das Flores, 100, Centro. Atendemos de segunda a sexta, das 8h às 18h, e aos sábados das 8h às 12h. Aceitamos cartão de crédito, débito e Pix.";
const PROCEDURES = ["Avaliação", "Clareamento dental", "Limpeza"];
const SLOTS = ["terça-feira, 20/10 às 09:00 com Dra. Ana", "terça-feira, 20/10 às 15:00 com Dra. Ana", "quarta-feira, 21/10 às 10:30 com Dra. Ana"];

const base: Omit<AiTurnInput, "step" | "message"> = { clinicName: "Clínica Exemplo", clinicInfo: INFO, procedures: PROCEDURES, slots: [], hasMoreSlots: false, chosenProcedure: null, forSelf: null };
const atSlots = { slots: SLOTS, hasMoreSlots: true, chosenProcedure: "Limpeza", forSelf: true };
const atConfirm = { slots: SLOTS, hasMoreSlots: true, chosenProcedure: "Limpeza", forSelf: true };

interface TurnCase {
  input: Partial<AiTurnInput> & Pick<AiTurnInput, "step" | "message">;
  expect: Partial<AiTurn> & { answered?: boolean };
}

const TURN_CASES: TurnCase[] = [
  { input: { step: "PROCEDURE", message: "queria clarear os dentes" }, expect: { procedure: 2 } },
  { input: { step: "PROCEDURE", message: "quero marcar uma limpeza pro meu filho" }, expect: { procedure: 3, whom: "other" } },
  { input: { step: "PROCEDURE", message: "bom dia! preciso de uma avaliação, é pra mim" }, expect: { procedure: 1, whom: "self" } },
  { input: { step: "PROCEDURE", message: "quero fazer uma limpeza e um clareamento" }, expect: { procedure: null } },
  { input: { step: "PROCEDURE", message: "vocês aceitam pix?" }, expect: { procedure: null, answered: true } },
  { input: { step: "WHO", message: "é pra minha esposa", chosenProcedure: "Limpeza" }, expect: { whom: "other" } },
  { input: { step: "WHO", message: "pra mim mesma", chosenProcedure: "Limpeza" }, expect: { whom: "self" } },
  { input: { step: "WHO", message: "é para o meu pai, ele tem 70 anos", chosenProcedure: "Limpeza" }, expect: { whom: "other" } },
  { input: { step: "SLOT", message: "pode ser a terça de manhã", ...atSlots }, expect: { slot: 1 } },
  { input: { step: "SLOT", message: "o último", ...atSlots }, expect: { slot: 3 } },
  { input: { step: "SLOT", message: "o das 15h", ...atSlots }, expect: { slot: 2 } },
  { input: { step: "SLOT", message: "terça", ...atSlots }, expect: { slot: null } },
  { input: { step: "SLOT", message: "tem outros horários?", ...atSlots }, expect: { slot: "more" } },
  { input: { step: "SLOT", message: "nenhum serve, só posso sexta", ...atSlots }, expect: { slot: "more" } },
  { input: { step: "CONFIRM", message: "pode marcar", ...atConfirm }, expect: { confirm: "yes" } },
  { input: { step: "CONFIRM", message: "fechado, obrigada!", ...atConfirm }, expect: { confirm: "yes" } },
  { input: { step: "CONFIRM", message: "melhor não, deixa pra depois", ...atConfirm }, expect: { confirm: "no" } },
  { input: { step: "CONFIRM", message: "prefiro o das 10:30 de quarta", ...atConfirm }, expect: { slot: 3 } },
  { input: { step: "SLOT", message: "quero falar com a recepção", ...atSlots }, expect: { human: true } },
  { input: { step: "SLOT", message: "vocês atendem sábado?", ...atSlots }, expect: { slot: null, answered: true } },
  { input: { step: "SLOT", message: "quanto custa o clareamento?", ...atSlots }, expect: { slot: null, answered: false } },
  { input: { step: "PROCEDURE", message: "qual o endereço de vocês?" }, expect: { answered: true } },
];

const PHRASE_CASES: Array<Omit<AiPhraseInput, "clinicName" | "retry" | "slotTaken"> & { retry?: boolean; slotTaken?: boolean; person?: string }> = [
  { goal: "ask_procedure", facts: [`Procedimentos oferecidos: ${PROCEDURES.join("; ")}`], required: [], greet: true, hasPatient: false },
  { goal: "ask_who", facts: [], required: [], greet: false, hasPatient: false },
  { goal: "ask_person", facts: [], required: [], greet: false, hasPatient: false },
  { goal: "ask_name", facts: [], required: [], greet: false, hasPatient: false },
  { goal: "ask_contact_name", facts: [], required: [], greet: false, hasPatient: false },
  { goal: "ask_procedure", facts: [`Procedimentos oferecidos: ${PROCEDURES.join("; ")}`], required: [], greet: false, hasPatient: false, retry: true },
  { goal: "offer_slots", facts: [...SLOTS, "Há mais horários, se nenhum desses servir."], required: SLOTS.map((slot) => slot.split(" com ")[0] as string), greet: false, hasPatient: false },
  { goal: "offer_slots", facts: [...SLOTS, "Há mais horários, se nenhum desses servir."], required: SLOTS.map((slot) => slot.split(" com ")[0] as string), greet: false, hasPatient: false, slotTaken: true },
  { goal: "confirm", facts: [`Horário: ${SLOTS[0]}`, "Procedimento: Limpeza"], required: ["terça-feira, 20/10 às 09:00"], greet: false, hasPatient: false },
  { goal: "confirm", facts: [`Horário: ${SLOTS[0]}`, "Procedimento: Limpeza", "O paciente é {{PACIENTE}} (consulta para outra pessoa)"], required: ["terça-feira, 20/10 às 09:00"], greet: false, hasPatient: true, person: "Pedro Souza" },
  { goal: "requested", facts: [], required: [], greet: false, hasPatient: false },
  { goal: "requested", facts: ["O pedido é para outra pessoa: o paciente é {{PACIENTE}}"], required: [], greet: false, hasPatient: true, person: "Pedro Souza" },
];
const SAMPLES = 3;

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

function mismatches(read: AiTurn, expected: TurnCase["expect"]): string[] {
  const wrong: string[] = [];
  for (const key of ["procedure", "whom", "slot", "confirm", "human"] as const) {
    if (key in expected && read[key] !== expected[key]) wrong.push(`${key}: esperado ${String(expected[key])}, veio ${String(read[key])}`);
  }
  if (expected.answered !== undefined && Boolean(read.answer) !== expected.answered) wrong.push(`answer: esperado ${expected.answered ? "resposta" : "sem resposta"}, veio ${JSON.stringify(read.answer)}`);
  if (read.confidence < 0.8 && Object.keys(expected).some((key) => expected[key as keyof typeof expected] !== null && key !== "answered")) wrong.push(`confiança baixa (${read.confidence})`);
  return wrong;
}

async function evaluate(apiKey: string, model: string): Promise<void> {
  const client = createOpenRouterClient({ apiKey, model, timeoutMs: 20_000 });
  console.log(`\n${model}`);
  let right = 0;
  let totalMs = 0;
  for (const item of TURN_CASES) {
    const started = Date.now();
    try {
      const read = await client.understandTurn({ ...base, ...item.input });
      totalMs += Date.now() - started;
      const wrong = mismatches(read, item.expect);
      if (wrong.length === 0) right += 1;
      else console.log(`  leitura errada: "${item.input.message}" -> ${wrong.join("; ")}`);
    } catch (error) {
      console.log(`  erro: "${item.input.message}": ${error instanceof Error ? error.message : "desconhecido"}`);
    }
  }
  console.log(`  leitura: ${right}/${TURN_CASES.length} | média ${Math.round(totalMs / TURN_CASES.length)} ms`);

  let valid = 0;
  let total = 0;
  let writeMs = 0;
  const shown = new Set<string>();
  for (const item of PHRASE_CASES) {
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      total += 1;
      const started = Date.now();
      try {
        const raw = await client.phrase({ clinicName: "Clínica Exemplo", retry: false, slotTaken: false, ...item });
        writeMs += Date.now() - started;
        const text = validatePhrase(raw, { goal: item.goal, required: item.required, person: item.person ?? null, material: ["Clínica Exemplo", ...item.facts] });
        if (text) {
          valid += 1;
          if (sample === 0) console.log(`  [${item.goal}${item.retry ? " retry" : ""}${item.slotTaken ? " ocupado" : ""}] ${text.replace(/\n/g, " / ")}`);
        } else if (!shown.has(item.goal)) {
          shown.add(item.goal);
          console.log(`  recusado [${item.goal}]: ${raw.replace(/\n/g, " / ")}`);
        }
      } catch (error) {
        console.log(`  erro [${item.goal}]: ${error instanceof Error ? error.message : "desconhecido"}`);
      }
    }
  }
  console.log(`  escrita aceita pela validação: ${valid}/${total} | média ${Math.round(writeMs / total)} ms`);
}

async function main(): Promise<void> {
  const models = (argument("--models") ?? process.env.AI_MODEL ?? "").split(",").map((model) => model.trim()).filter(Boolean);
  if (models.length === 0) throw new Error("Informe --models modelo-a,modelo-b");
  const apiKey = await loadKey();
  for (const model of models) await evaluate(apiKey, model);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
