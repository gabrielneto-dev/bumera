import { describe, expect, it } from "vitest";
import { cleanName, greetingOf, isAffirmation, isGreeting, isResetCommand, withGreeting, looksLikeBookingRequest, matchProcedure, parseChoice } from "@/lib/booking/text";

const procedures = [
  { id: "p1", name: "Avaliação" },
  { id: "p2", name: "Limpeza" },
  { id: "p3", name: "Clareamento dental" },
  { id: "p4", name: "Consulta de teste" },
];

describe("parseChoice", () => {
  it.each([
    ["1", 1],
    [" 2 ", 2],
    ["*3*", 3],
    ["3.", 3],
    ["opção 4", 4],
    ["opcao 2", 2],
    ["0", 0],
    ["quero a 2", 2],
  ])("reads %j as %j", (text, expected) => expect(parseChoice(text)).toBe(expected));

  it.each(["", "oi", "12345", "1 2", "sexta às 14h", "vinte"])("does not guess on %j", (text) => expect(parseChoice(text)).toBeNull());
});

describe("matchProcedure", () => {
  it.each([
    ["quero fazer um clareamento", "p3"],
    ["queria uma limpeza", "p2"],
    ["preciso de uma avaliacao", "p1"],
    ["CLAREAMENTO DENTAL", "p3"],
    ["uma consulta de teste", "p4"],
  ])("finds the procedure in %j", (text, id) => expect(matchProcedure(text, procedures)).toBe(id));

  it("answers null when nothing, or more than one procedure, matches", () => {
    expect(matchProcedure("quero marcar", procedures)).toBeNull();
    expect(matchProcedure("limpeza e clareamento", procedures)).toBeNull();
    expect(matchProcedure("implante", procedures)).toBeNull();
  });
});

describe("looksLikeBookingRequest", () => {
  it.each([
    "Quero marcar uma consulta",
    "gostaria de agendar uma limpeza",
    "queria agendar",
    "preciso marcar um horário",
    "tem horário essa semana?",
    "Vocês têm vaga amanhã?",
  ])("recognizes %j", (text) => expect(looksLikeBookingRequest(text)).toBe(true));

  it.each(["confirmo minha consulta de amanhã", "que horas vocês abrem?", "quanto custa a limpeza?", "obrigado", "vou desmarcar a consulta"])(
    "does not take %j for a request",
    (text) => expect(looksLikeBookingRequest(text)).toBe(false),
  );
});

describe("cleanName", () => {
  it.each([
    ["Ana Souza", "Ana Souza"],
    ["meu nome é Ana Souza", "Ana Souza"],
    ["Sou a Ana Souza.", "Ana Souza"],
    ["me chamo joão  da   silva", "João da Silva"],
    ["  maria  ", "Maria"],
  ])("reads the name in %j", (text, expected) => expect(cleanName(text)).toBe(expected));

  it.each(["", "1", "ok", "https://evil.example", "123456", "a", "x".repeat(120), "quero marcar"])("refuses %j as a name", (text) => expect(cleanName(text)).toBeNull());

  it("removes formatting and links a person could smuggle in", () => {
    expect(cleanName("*Ana* _Souza_ www.evil.example")).toBe("Ana Souza");
  });
});

describe("isGreeting", () => {
  it.each(["Oi", "oi!", "Olá", "Oi, boa noite", "bom dia", "boa tarde, tudo bem?", "e aí, tudo bem", "opa"])("sees %j as only a hello", (text) => {
    expect(isGreeting(text)).toBe(true);
  });

  it.each(["", "oi, quero marcar uma limpeza", "boa noite, vocês atendem sábado?", "bem", "quero agendar", "1", "sim"])("does not treat %j as only a hello", (text) => {
    expect(isGreeting(text)).toBe(false);
  });
});

describe("isResetCommand", () => {
  it.each(["recomeçar", "Recomeçar!", "reiniciar", "limpar conversa", "começar de novo"])("sees %j as a request to start over", (text) => {
    expect(isResetCommand(text)).toBe(true);
  });

  it.each(["quero recomeçar o tratamento", "1", "oi", "cancelar"])("does not treat %j as one", (text) => {
    expect(isResetCommand(text)).toBe(false);
  });
});

describe("isAffirmation", () => {
  it.each(["sim", "Pode ser", "pode ser!", "claro", "sim, quero", "com certeza", "beleza", "Fechado"])("sees %j as a yes", (text) => {
    expect(isAffirmation(text)).toBe(true);
  });

  it.each(["", "não", "pode ser terça de manhã", "ser", "por favor", "quero uma limpeza e um clareamento"])("does not treat %j as a plain yes", (text) => {
    expect(isAffirmation(text)).toBe(false);
  });
});

describe("greetingOf", () => {
  it.each([
    ["bom dia!", "Bom dia"],
    ["Oi, boa tarde", "Boa tarde"],
    ["boa noite pessoal, quero marcar", "Boa noite"],
    ["BOM DIA", "Bom dia"],
  ])("reads %j as %j", (text, expected) => expect(greetingOf(text)).toBe(expected));

  it.each(["oi", "olá", "quero marcar", "bom", "dia 12 pode?"])("finds no time-of-day greeting in %j", (text) => expect(greetingOf(text)).toBeNull());
});

describe("withGreeting", () => {
  it("swaps a leading 'Olá!' for the person's greeting", () => {
    expect(withGreeting("Olá! Aqui é a clínica.", "Bom dia")).toBe("Bom dia! Aqui é a clínica.");
    expect(withGreeting("Oi, tudo bem? Em que posso ajudar?", "Boa noite")).toBe("Boa noite! Tudo bem? Em que posso ajudar?");
  });

  it("adds the greeting when the text starts otherwise, and keeps one that is already there", () => {
    expect(withGreeting("Qual procedimento você procura?", "Boa tarde")).toBe("Boa tarde! Qual procedimento você procura?");
    expect(withGreeting("Bom dia, Ana! Tudo certo.", "Bom dia")).toBe("Bom dia, Ana! Tudo certo.");
  });

  it("leaves the text alone without a greeting", () => {
    expect(withGreeting("Olá! Aqui é a clínica.", null)).toBe("Olá! Aqui é a clínica.");
  });
});
