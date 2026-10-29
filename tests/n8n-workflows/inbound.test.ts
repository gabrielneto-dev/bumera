import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postAnswer } from "@/app/api/v1/clinics/[clinicId]/answers/route";
import { GET as getByInstance } from "@/app/api/v1/clinics/by-instance/[instance]/route";
import { createPrismaClient } from "@/lib/prisma";
import { connectWhatsapp, createClinic, createDentist, createPatient, createProcedure } from "../helpers/factories";
import { loadWorkflow, nextNodes, nodeOf, runCode, runHttp, runIf } from "../helpers/n8n-workflow";

/**
 * Battery for the inbound workflow in n8n ("Bumera - Entrada do WhatsApp").
 * It runs the exported copy in n8n/workflows against Evolution webhook bodies and the
 * app's real answer route. Keep n8n/workflows/inbound.json in sync with the live workflow.
 */

const workflow = loadWorkflow("inbound.json");
const prisma = createPrismaClient(process.env.DATABASE_URL as string);
const KEY = "service-key-service-key-service-key-0001";
const HOUR = 3_600_000;
const PHONE = "5511987654321";

type Item = Record<string, unknown>;

/** A `messages.upsert` webhook body as Evolution v2 sends it, wrapped the way n8n's Webhook node outputs it. */
function upsert(message: Item, key: Item = {}, body: Item = {}): Item {
  return {
    body: {
      event: "messages.upsert",
      instance: "bumera-teste",
      data: { key: { remoteJid: `${PHONE}@s.whatsapp.net`, fromMe: false, id: "MSG-1", ...key }, message, messageType: "conversation" },
      ...body,
    },
  };
}

const text = (conversation: string, key: Item = {}) => upsert({ conversation }, key);
const read = (...items: Item[]) => runCode(workflow, "Ler mensagem", items);

describe("inbound workflow: reading Evolution messages", () => {
  it("keeps a person's text message as instance, phone, id and command, without the text", () => {
    expect(read(text("1"))).toEqual([{ instance: "bumera-teste", phone: PHONE, messageId: "MSG-1", command: "CONFIRM" }]);
    expect(read(text("Olá, queria saber o preço do clareamento"))).toEqual([
      { instance: "bumera-teste", phone: PHONE, messageId: "MSG-1", command: "" },
    ]);
  });

  it.each([
    ["1", "CONFIRM"],
    [" 1. ", "CONFIRM"],
    ["2", "RESCHEDULE"],
    ["SAIR", "OPT_OUT"],
    ["Sair!", "OPT_OUT"],
    ["parar", "OPT_OUT"],
    ["Pare", "OPT_OUT"],
    ["descadastrar", "OPT_OUT"],
    ["cancelar mensagens", "OPT_OUT"],
    ["sair agora", ""],
    ["12", ""],
    ["1 e 2", ""],
    ["não quero sair", ""],
    ["sim", ""],
  ])("reads %j as command %j (whole message only)", (message, command) => {
    expect(read(text(message))[0]?.command).toBe(command);
  });

  it("reads text typed as an extended message (reply, link preview)", () => {
    expect(read(upsert({ extendedTextMessage: { text: "SAIR" } }))[0]?.command).toBe("OPT_OUT");
  });

  it("keeps audio and other media as a non-command message, so it ends a block", () => {
    expect(read(upsert({ audioMessage: { seconds: 4 } }))).toEqual([{ instance: "bumera-teste", phone: PHONE, messageId: "MSG-1", command: "" }]);
    expect(read(upsert({ imageMessage: { caption: "1" } }))[0]?.command).toBe("");
  });

  it("accepts the event name in either spelling and data as a list", () => {
    expect(read(upsert({ conversation: "2" }, {}, { event: "MESSAGES_UPSERT" }))[0]?.command).toBe("RESCHEDULE");
    const listed = text("1") as { body: { data: unknown } };
    expect(read({ body: { ...listed.body, data: [listed.body.data] } })[0]?.command).toBe("CONFIRM");
  });

  it("uses the real number when WhatsApp hides it behind a @lid id", () => {
    const hidden = text("1", { remoteJid: "123456789@lid", remoteJidAlt: `${PHONE}@s.whatsapp.net` });
    expect(read(hidden)[0]?.phone).toBe(PHONE);
  });

  it.each([
    ["our own messages", text("1", { fromMe: true })],
    ["groups", text("1", { remoteJid: "120363000000000000@g.us" })],
    ["status broadcasts", text("1", { remoteJid: "status@broadcast" })],
    ["foreign numbers", text("1", { remoteJid: "14155550100@s.whatsapp.net" })],
    ["a @lid id without the real number", text("1", { remoteJid: "123456789@lid" })],
    ["stickers", upsert({ stickerMessage: {} })],
    ["reactions", upsert({ reactionMessage: { text: "👍" } })],
    ["deleted messages", upsert({ protocolMessage: { type: 0 } })],
    ["other events", upsert({ conversation: "1" }, {}, { event: "connection.update" })],
    ["a body without instance", upsert({ conversation: "1" }, {}, { instance: "" })],
    ["a body without message id", text("1", { id: "" })],
    ["an empty body", {}],
  ])("ignores %s", (_, item) => {
    expect(read(item)).toEqual([]);
  });
});

describe("inbound workflow: deciding a block of messages", () => {
  const row = (id: number, messageId: string, command: string) => ({ id, instance: "bumera-teste", phone: PHONE, messageId, command });
  const mine = (messageId: string) => ({ "Ler mensagem": { instance: "bumera-teste", phone: PHONE, messageId, command: "" } });
  const decide = (rows: Item[], messageId: string) => runCode(workflow, "Decidir o bloco", rows, mine(messageId));

  it("answers a lone command", () => {
    expect(decide([row(7, "A", "CONFIRM")], "A")).toEqual([{ instance: "bumera-teste", phone: PHONE, answer: "CONFIRM", lastRowId: 7 }]);
  });

  it("leaves the block to the execution of its newest message", () => {
    expect(decide([row(7, "A", "CONFIRM"), row(8, "B", "RESCHEDULE")], "A")).toEqual([]);
    expect(decide([row(7, "A", "CONFIRM"), row(8, "B", "RESCHEDULE")], "B")).toMatchObject([{ answer: "RESCHEDULE", lastRowId: 8 }]);
  });

  it("reads rows in the order they arrived, whatever order the table returns", () => {
    expect(decide([row(8, "B", "RESCHEDULE"), row(7, "A", "CONFIRM")], "B")).toMatchObject([{ answer: "RESCHEDULE" }]);
  });

  it("lets SAIR anywhere in the block win", () => {
    expect(decide([row(1, "A", "OPT_OUT"), row(2, "B", "CONFIRM"), row(3, "C", "")], "C")).toMatchObject([{ answer: "OPT_OUT", lastRowId: 3 }]);
  });

  it("does not act on a command followed by free text or audio", () => {
    expect(decide([row(1, "A", "CONFIRM"), row(2, "B", "")], "B")).toMatchObject([{ answer: "" }]);
  });

  it("still clears a block that ends in free text, but only acts on commands", () => {
    expect(nextNodes(workflow, "Decidir o bloco").sort()).toEqual(["Limpar o bloco", "É um comando?"]);
    expect(runIf(workflow, "É um comando?", { answer: "" })).toBe(false);
    expect(runIf(workflow, "É um comando?", { answer: "OPT_OUT" })).toBe(true);
  });

  it("does nothing when another execution already cleared the block", () => {
    expect(decide([], "A")).toEqual([]);
  });
});

describe("inbound workflow: wiring", () => {
  it("answers Evolution at once and never exposes its secret path in the repository", () => {
    const hook = nodeOf(workflow, "Evolution chamou");
    expect(hook.parameters).toMatchObject({ httpMethod: "POST", responseMode: "onReceived" });
    expect(hook.parameters.path).toBe("<segredo: veja o nó no n8n>");
  });

  it("drops repeated deliveries before they join a block, then waits for the block to end", () => {
    expect(nextNodes(workflow, "Evolution chamou")).toEqual(["Ler mensagem"]);
    expect(nextNodes(workflow, "Ler mensagem")).toEqual(["Mensagem nova?"]);
    expect(nodeOf(workflow, "Mensagem nova?").parameters).toMatchObject({ operation: "rowNotExists" });
    expect(nextNodes(workflow, "Mensagem nova?")).toEqual(["Guardar no bloco"]);
    expect(nextNodes(workflow, "Guardar no bloco")).toEqual(["Esperar o bloco"]);
    expect(nodeOf(workflow, "Esperar o bloco").parameters).toMatchObject({ amount: 8, unit: "seconds" });
    expect(nextNodes(workflow, "Esperar o bloco")).toEqual(["Ler o bloco"]);
    expect(nextNodes(workflow, "Ler o bloco")).toEqual(["Decidir o bloco"]);
  });

  it("stores only the command in the block table, never the message text", () => {
    const columns = nodeOf(workflow, "Guardar no bloco").parameters.columns as { value: Item };
    expect(Object.keys(columns.value).sort()).toEqual(["command", "instance", "messageId", "phone"]);
  });

  it("clears only the rows of that person's block, up to the newest one decided", () => {
    const { filters, matchType } = nodeOf(workflow, "Limpar o bloco").parameters as { filters: { conditions: Item[] }; matchType: string };
    expect(matchType).toBe("allConditions");
    expect(filters.conditions.map(({ keyName, condition }) => `${keyName} ${condition}`)).toEqual(["instance eq", "phone eq", "id lte"]);
    const read = nodeOf(workflow, "Ler o bloco").parameters as { matchType: string; returnAll: boolean };
    expect(read).toMatchObject({ matchType: "allConditions", returnAll: true });
  });

  it("calls the app only with the service key and Evolution only with its own key", () => {
    for (const node of workflow.nodes.filter((candidate) => candidate.type === "n8n-nodes-base.httpRequest")) {
      const url = String(node.parameters.url);
      const credential = node.credentials?.httpHeaderAuth?.name;
      if (url.includes("bumera-app:3000")) expect(credential, node.name).toBe("Bumera service key");
      else if (url.includes("bumera-evolution:8080")) expect(credential, node.name).toBe("Evolution API key");
      else throw new Error(`${node.name} calls an unexpected host: ${url}`);
    }
  });

  it("has no AI node yet: this slice only handles commands", () => {
    expect(workflow.nodes.map((node) => node.type).filter((type) => /langchain|openAi|anthropic|gemini|agent/i.test(type))).toEqual([]);
  });
});

describe("inbound workflow: the app applies the answer", () => {
  let clinic: string;
  let appointmentId: string;

  beforeEach(async () => {
    vi.stubEnv("SERVICE_API_KEY", KEY);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "organization" CASCADE');
    clinic = await createClinic(prisma, "a");
    await connectWhatsapp(prisma, clinic);
    const dentist = await createDentist(prisma, clinic, "Dra. Ana");
    const procedure = await createProcedure(prisma, clinic, "Limpeza");
    const patient = await createPatient(prisma, clinic, { name: "Maria Souza", phoneE164: `+${PHONE}` });
    const startsAt = new Date(Date.now() + 48 * HOUR);
    appointmentId = (
      await prisma.appointment.create({
        data: { organizationId: clinic, patientId: patient.id, dentistId: dentist.id, procedureId: procedure.id, startsAt, endsAt: new Date(startsAt.getTime() + HOUR / 2) },
      })
    ).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  /** Runs the workflow from "Decidir o bloco" on, against the app's real routes; returns what it would send. */
  async function respond(answer: string, phone = PHONE) {
    const decided = { instance: "bumera-teste", phone, answer, lastRowId: 1 };
    if (!runIf(workflow, "É um comando?", decided)) return { clinicRequest: null, answerBody: null, reply: null, send: null };
    const refs = { "Decidir o bloco": decided };

    const clinicRequest = runHttp(workflow, "Clínica do número", decided, refs);
    const instance = decodeURIComponent(clinicRequest.url.split("/by-instance/")[1] ?? "");
    const clinicResponse = await getByInstance(authed(clinicRequest.url), { params: Promise.resolve({ instance }) });
    const clinicJson = (await clinicResponse.json()) as Item;

    const answerRequest = runHttp(workflow, "Aplicar resposta", clinicJson, refs);
    const clinicId = /\/clinics\/([^/]+)\/answers$/.exec(answerRequest.url)?.[1] ?? "";
    const answerResponse = await postAnswer(authed(answerRequest.url, answerRequest.body), { params: Promise.resolve({ clinicId }) });
    const answerJson = (await answerResponse.json()) as { data: { outcome: string; reply: string | null } };

    const send = runIf(workflow, "Tem resposta?", answerJson, refs) ? runHttp(workflow, "Responder pela Evolution", answerJson, refs) : null;
    return { clinicRequest, clinicId, answerBody: answerRequest.body, outcome: answerJson.data.outcome, reply: answerJson.data.reply, send };
  }

  const authed = (url: string, body?: unknown) =>
    new Request(url.replace("http://bumera-app:3000", "http://localhost"), {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("'1' confirms the next appointment and sends the app's reply to the same person", async () => {
    const result = await respond("CONFIRM");
    expect(result.clinicRequest?.url).toBe("http://bumera-app:3000/api/v1/clinics/by-instance/bumera-teste");
    expect(result.clinicId).toBe(clinic);
    expect(result.answerBody).toEqual({ phone: PHONE, answer: "CONFIRM" });
    expect(result.outcome).toBe("CONFIRMED");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe("CONFIRMED");
    expect(result.send).toEqual({
      method: "POST",
      url: "http://bumera-evolution:8080/message/sendText/bumera-teste",
      body: { number: PHONE, text: result.reply, delay: 1200 },
    });
    expect(result.reply).toContain("Consulta confirmada");
  });

  it("'2' asks the team to reschedule", async () => {
    const result = await respond("RESCHEDULE");
    expect(result.outcome).toBe("RESCHEDULE_REQUESTED");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).rescheduleRequestedAt).not.toBeNull();
    expect(result.send?.body).toMatchObject({ number: PHONE });
  });

  it("'SAIR' opts the person out and acknowledges it", async () => {
    const result = await respond("OPT_OUT");
    expect(result.outcome).toBe("OPTED_OUT");
    expect((await prisma.patient.findFirstOrThrow({ where: { organizationId: clinic } })).doNotContact).toBe(true);
    expect(result.send?.body).toMatchObject({ number: PHONE, text: expect.stringContaining("não vai mais receber") });
  });

  it("sends nothing to a number the clinic does not know", async () => {
    const result = await respond("CONFIRM", "5511900009999");
    expect(result.outcome).toBe("UNKNOWN_PATIENT");
    expect(result.send).toBeNull();
  });

  it("sends nothing when the person has no appointment to answer about", async () => {
    await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });
    const result = await respond("CONFIRM");
    expect(result.outcome).toBe("NO_APPOINTMENT");
    expect(result.send).toBeNull();
  });

  it("does not call the app for a block without a command", async () => {
    expect(await respond("")).toMatchObject({ clinicRequest: null, send: null });
  });
});
