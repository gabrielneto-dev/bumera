import { describe, expect, it } from "vitest";
import { cleanName, isGreeting, isResetCommand, looksLikeBookingRequest, matchProcedure, parseChoice } from "@/lib/booking/text";

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
