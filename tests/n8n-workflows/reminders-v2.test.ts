import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postResult } from "@/app/api/v1/reminders/[id]/result/route";
import { ReminderKind } from "@/generated/prisma/client";
import { claimDueReminders, type DueReminder } from "@/lib/reminders/dispatch";
import { createPrismaClient } from "@/lib/prisma";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { loadWorkflow, nextNodes, nodeOf, runHttp, runSet, runSwitch } from "../helpers/n8n-workflow";
import { NOW } from "../helpers/service-context";

/**
 * Battery for the reminder workflow in n8n ("Bumera - Lembretes por WhatsApp (v2)").
 * It runs the exported copy in n8n/workflows against reminders the app really hands out,
 * so a change on either side (a new kind, a renamed field, a broken text) fails here.
 * Keep n8n/workflows/reminders-v2.json in sync with the live workflow (deploy/README.md).
 */

const workflow = loadWorkflow("reminders-v2.json");
const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const KEY = "service-key-service-key-service-key-0001";
const MINUTE = 60_000;
const HOUR = 3_600_000;
const SPLIT = "Uma por lembrete";
const SEND = "Enviar pela Evolution";
const OPT_OUT = "Para não receber mais mensagens, responda *SAIR*.";

type Item = Record<string, unknown>;

/** What the workflow does with one due reminder, up to the Evolution request. */
function run(due: DueReminder | Item) {
  const item = JSON.parse(JSON.stringify(due)) as Item;
  const facts = runSet(workflow, "Dados da mensagem", item);
  const route = runSwitch(workflow, "Separar por tipo", facts);
  const [target] = nextNodes(workflow, "Separar por tipo", route.output);
  if (!target.startsWith("Texto: ")) return { route, target, text: null, send: null };
  const withText = runSet(workflow, target, facts);
  const send = runHttp(workflow, SEND, withText, { [SPLIT]: item });
  return { route, target, text: withText.texto as string, send };
}

/** The app's report endpoint, called exactly as the given report node would call it. */
async function report(node: string, due: DueReminder) {
  const request = runHttp(workflow, node, {}, { [SPLIT]: JSON.parse(JSON.stringify(due)) as Item });
  const id = /\/api\/v1\/reminders\/([^/]+)\/result$/.exec(request.url)?.[1] ?? "";
  const response = await postResult(
    new Request(`http://localhost/api/v1/reminders/${id}/result`, {
      method: request.method,
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify(request.body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { request, response };
}

describe("reminder workflow v2: wiring", () => {
  it("has one text path for every reminder kind the app knows, and a fallback", () => {
    const kinds = runSwitchKinds();
    expect([...kinds].sort()).toEqual(Object.values(ReminderKind).sort());
    const rules = (nodeOf(workflow, "Separar por tipo").parameters.rules as { values: unknown[] }).values;
    rules.forEach((_, output) => {
      const [text] = nextNodes(workflow, "Separar por tipo", output);
      expect(text).toMatch(/^Texto: /);
      expect(nextNodes(workflow, text)).toEqual([SEND]);
    });
    expect(nextNodes(workflow, "Separar por tipo", rules.length)).toEqual(["Reportar tipo desconhecido"]);
  });

  it("reports every send: success to 'sent' and an Evolution error to 'failed'", () => {
    expect(nodeOf(workflow, SEND).onError).toBe("continueErrorOutput");
    expect(nextNodes(workflow, SEND, 0)).toEqual(["Reportar enviado"]);
    expect(nextNodes(workflow, SEND, 1)).toEqual(["Reportar falha"]);
  });

  it("polls the app every minute in small batches with the service key", () => {
    expect(nextNodes(workflow, "A cada minuto")).toEqual(["Buscar lembretes devidos"]);
    const fetch = nodeOf(workflow, "Buscar lembretes devidos");
    expect(fetch.parameters.url).toBe("http://bumera-app:3000/api/v1/reminders/due");
    expect(fetch.parameters.queryParameters).toEqual({ parameters: [{ name: "limit", value: "20" }] });
    expect(nextNodes(workflow, "Buscar lembretes devidos")).toEqual([SPLIT]);
    expect(nextNodes(workflow, SPLIT)).toEqual(["Dados da mensagem"]);
    expect(nextNodes(workflow, "Dados da mensagem")).toEqual(["Separar por tipo"]);
  });

  it("calls the app only with the service key and Evolution only with its own key", () => {
    const http = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
    for (const node of http) {
      const url = String(node.parameters.url);
      const credential = node.credentials?.httpHeaderAuth?.name;
      if (url.includes("bumera-app:3000")) expect(credential, node.name).toBe("Bumera service key");
      else if (url.includes("bumera-evolution:8080")) expect(credential, node.name).toBe("Evolution API key");
      else throw new Error(`${node.name} calls an unexpected host: ${url}`);
    }
  });

  it("paces Evolution sends one at a time", () => {
    const options = nodeOf(workflow, SEND).parameters.options as { batching: { batch: { batchSize: number; batchInterval: number } } };
    expect(options.batching.batch.batchSize).toBe(1);
    expect(options.batching.batch.batchInterval).toBeGreaterThanOrEqual(3000);
  });

  it("has no AI node: reminder texts are fixed templates over the app's facts", () => {
    const types = workflow.nodes.map((node) => node.type);
    expect(types.filter((type) => /langchain|openAi|anthropic|gemini|agent/i.test(type))).toEqual([]);
  });
});

function runSwitchKinds(): string[] {
  const rules = (nodeOf(workflow, "Separar por tipo").parameters.rules as {
    values: { conditions: { conditions: { rightValue: string }[] } }[];
  }).values;
  return rules.map((rule) => rule.conditions.conditions[0].rightValue);
}

describe("reminder workflow v2: texts from real due reminders", () => {
  let clinic: string;
  let dentistId: string;
  let procedureId: string;
  let adultId: string;
  let childId: string;
  /** Appointments seeded in one test go an hour apart: a dentist cannot be double-booked. */
  let seeded: number;

  beforeEach(async () => {
    seeded = 0;
    vi.stubEnv("SERVICE_API_KEY", KEY);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    dentistId = (await createDentist(prisma, clinic, "Dra. Ana Paula")).id;
    procedureId = (await createProcedure(prisma, clinic, "Limpeza")).id;
    adultId = (await createPatient(prisma, clinic, { name: "Maria da Silva", phoneE164: "+5511987654321" })).id;
    childId = (await createPatient(prisma, clinic, { name: "Pedro Souza", phoneE164: "+5511900001111" })).id;
    await prisma.patient.update({ where: { id: childId }, data: { guardianName: "Joana Souza" } });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  type AppointmentKind = "CONFIRMATION" | "REMINDER_24H" | "REMINDER_2H" | "NO_SHOW_FOLLOWUP" | "REACTIVATION";

  /** Seeds one reminder the guard lets through and claims it like n8n's GET /due does. */
  async function claimAppointmentReminder(kind: AppointmentKind, patientId = adultId, at?: Date): Promise<DueReminder> {
    const past = kind === "NO_SHOW_FOLLOWUP" || kind === "REACTIVATION";
    const offset = seeded++ * HOUR;
    const startsAt = at ?? (past ? new Date(NOW.getTime() - 3 * HOUR - offset) : new Date(NOW.getTime() + 48 * HOUR + offset));
    const status = kind === "NO_SHOW_FOLLOWUP" ? "NO_SHOW" : kind === "REACTIVATION" ? "COMPLETED" : "SCHEDULED";
    const appointment = await prisma.appointment.create({
      data: { organizationId: clinic, patientId, dentistId, procedureId, startsAt, endsAt: new Date(startsAt.getTime() + 30 * MINUTE), status },
    });
    await prisma.reminder.create({ data: { organizationId: clinic, appointmentId: appointment.id, kind, dueAt: new Date(NOW.getTime() - MINUTE) } });
    return claimOne();
  }

  async function claimQuoteReminder(kind: "QUOTE_FOLLOWUP_1" | "QUOTE_FOLLOWUP_2", description = "Implante unitário"): Promise<DueReminder> {
    const quote = await prisma.quote.create({ data: { organizationId: clinic, patientId: adultId, description } });
    await prisma.reminder.create({ data: { organizationId: clinic, quoteId: quote.id, kind, dueAt: new Date(NOW.getTime() - MINUTE) } });
    return claimOne();
  }

  async function claimOne(): Promise<DueReminder> {
    const claimed = await claimDueReminders(prisma, { now: NOW });
    expect(claimed).toHaveLength(1);
    return claimed[0];
  }

  const DETAILS = "📅 sábado, 17/10 às 09:00\n🦷 Limpeza\n👤 Dra. Ana Paula";
  const ANSWER = "Responda:\n*1* para confirmar\n*2* para remarcar";
  const QUOTE_ANSWER = "Responda:\n*1* para falar com a equipe\n*2* para agora não";
  const paragraphs = (...parts: string[]) => parts.join("\n\n");

  describe("adult patient", () => {
    it.each([
      ["CONFIRMATION", paragraphs("Olá, Maria!", "Sua consulta na *Clinic a* foi agendada.", DETAILS, ANSWER, OPT_OUT)],
      ["REMINDER_24H", paragraphs("Olá, Maria!", "Lembrete: você tem uma consulta na *Clinic a*.", DETAILS, ANSWER, OPT_OUT)],
      ["REMINDER_2H", paragraphs("Olá, Maria!", "Lembrete: sua consulta na *Clinic a* está chegando.", DETAILS, "Até já!")],
      [
        "NO_SHOW_FOLLOWUP",
        paragraphs(
          "Olá, Maria!",
          "Sentimos sua falta na consulta de quinta-feira, 15/10 às 06:00 na *Clinic a*.",
          "Quer remarcar? Responda *2* e nossa equipe entra em contato.",
          OPT_OUT,
        ),
      ],
      [
        "REACTIVATION",
        paragraphs(
          "Olá, Maria!",
          "Faz um tempo desde o seu atendimento na *Clinic a* (Limpeza). Que tal agendar o seu retorno?",
          "Responda:\n*1* para agendar\n*2* para agora não",
          OPT_OUT,
        ),
      ],
    ] as const)("%s produces the exact text", async (kind, expected) => {
      const due = await claimAppointmentReminder(kind);
      const { route, text } = run(due);
      expect(route.key).not.toBe("Tipo desconhecido");
      expect(text).toBe(expected);
    });

    it.each([
      [
        "QUOTE_FOLLOWUP_1",
        paragraphs("Olá, Maria!", "Passando para saber se ficou alguma dúvida sobre o orçamento *Implante unitário* na *Clinic a*.", QUOTE_ANSWER, OPT_OUT),
      ],
      [
        "QUOTE_FOLLOWUP_2",
        paragraphs(
          "Olá, Maria!",
          "O seu orçamento *Implante unitário* na *Clinic a* continua disponível. Quer conversar sobre as condições?",
          QUOTE_ANSWER,
          OPT_OUT,
        ),
      ],
    ] as const)("%s produces the exact text", async (kind, expected) => {
      const due = await claimQuoteReminder(kind);
      expect(run(due).text).toBe(expected);
    });
  });

  describe("dependent patient (greets the guardian, names the dependent)", () => {
    it.each([
      ["CONFIRMATION", "A consulta de *Pedro* na *Clinic a* foi agendada."],
      ["REMINDER_24H", "Lembrete: *Pedro* tem uma consulta na *Clinic a*."],
      ["REMINDER_2H", "Lembrete: a consulta de *Pedro* na *Clinic a* está chegando."],
      ["NO_SHOW_FOLLOWUP", "Sentimos a falta de *Pedro* na consulta de quinta-feira, 15/10 às 06:00 na *Clinic a*."],
      ["REACTIVATION", "Faz um tempo desde o atendimento de *Pedro* na *Clinic a* (Limpeza). Que tal agendar o retorno?"],
    ] as const)("%s", async (kind, line) => {
      const due = await claimAppointmentReminder(kind, childId);
      const text = run(due).text ?? "";
      expect(text.startsWith("Olá, Joana!\n\n")).toBe(true);
      expect(text.split("\n\n")[1]).toBe(line);
      expect(text).not.toContain("Souza");
    });
  });

  it("every kind reads cleanly: no undefined, null or leftover template markers", async () => {
    const dues = [
      await claimAppointmentReminder("CONFIRMATION"),
      await claimAppointmentReminder("REMINDER_24H", childId),
      await claimQuoteReminder("QUOTE_FOLLOWUP_2"),
    ];
    for (const due of dues) {
      const text = run(due).text ?? "";
      expect(text).not.toMatch(/undefined|null|NaN|\{\{|\}\}|\[object/);
      expect(text).not.toMatch(/\n{3,}/);
    }
  });

  it("only the 2-hour reminder leaves out the SAIR line", async () => {
    for (const kind of ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H", "NO_SHOW_FOLLOWUP", "REACTIVATION"] as const) {
      await prisma.reminder.deleteMany({});
      seeded = 0;
      await prisma.appointment.deleteMany({});
      const text = run(await claimAppointmentReminder(kind)).text ?? "";
      expect(text.endsWith(OPT_OUT), kind).toBe(kind !== "REMINDER_2H");
    }
  });

  it("greets without a name when the patient has no usable first name", async () => {
    const due = await claimAppointmentReminder("REMINDER_24H");
    const text = run({ ...due, patient: { ...due.patient, firstName: "" } }).text ?? "";
    expect(text.startsWith("Olá!\n\n")).toBe(true);
  });

  it("keeps markup and links typed into a quote out of the message", async () => {
    const due = await claimQuoteReminder("QUOTE_FOLLOWUP_1", "*Promo* http://evil.example/x Implante");
    const text = run(due).text ?? "";
    expect(text).toContain("o orçamento *Promo Implante* na");
    expect(text).not.toMatch(/http|evil/);
  });

  it("sends to the clinic's instance and the patient's number as digits", async () => {
    const due = await claimAppointmentReminder("CONFIRMATION");
    const { send, text } = run(due);
    expect(send).toEqual({
      method: "POST",
      url: "http://bumera-evolution:8080/message/sendText/bumera-teste",
      body: { number: "5511987654321", text, delay: 1200 },
    });
  });

  it("routes a kind it does not know to the 'unknown kind' report, sending nothing", async () => {
    const due = await claimAppointmentReminder("CONFIRMATION");
    const { route, target, send } = run({ ...due, kind: "BIRTHDAY" });
    expect(route.key).toBe("Tipo desconhecido");
    expect(target).toBe("Reportar tipo desconhecido");
    expect(send).toBeNull();
  });

  describe("reports reach the app", () => {
    // The result route stamps the real clock, so these appointments sit ahead of it (and of NOW).
    const ahead = () => new Date(Date.now() + 30 * 24 * HOUR);

    it("'Reportar enviado' marks the reminder as sent", async () => {
      const due = await claimAppointmentReminder("REMINDER_24H", adultId, ahead());
      const { request, response } = await report("Reportar enviado", due);
      expect(request.body).toEqual({ outcome: "sent", attempt: 1 });
      expect(response.status).toBe(200);
      expect((await prisma.reminder.findUniqueOrThrow({ where: { id: due.id } })).status).toBe("SENT");
    });

    it("'Reportar falha' puts the reminder back for a retry", async () => {
      const due = await claimAppointmentReminder("REMINDER_24H", adultId, ahead());
      const { request, response } = await report("Reportar falha", due);
      expect(request.body).toEqual({ outcome: "failed", attempt: 1, error: "evolution_send_failed" });
      expect(response.status).toBe(200);
      const stored = await prisma.reminder.findUniqueOrThrow({ where: { id: due.id } });
      expect(stored).toMatchObject({ status: "PENDING", note: "evolution_send_failed" });
    });

    it("'Reportar tipo desconhecido' records the reason", async () => {
      const due = await claimAppointmentReminder("REMINDER_24H", adultId, ahead());
      const { request, response } = await report("Reportar tipo desconhecido", due);
      expect(request.body).toEqual({ outcome: "failed", attempt: 1, error: "unknown_kind" });
      expect(response.status).toBe(200);
      expect((await prisma.reminder.findUniqueOrThrow({ where: { id: due.id } })).note).toBe("unknown_kind");
    });
  });
});
