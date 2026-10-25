import { describe, expect, it } from "vitest";
import { renderReminderMessage, sanitizeName } from "@/lib/reminders/messages";

const input = {
  clinicName: "Clínica Sorriso",
  patientName: "Maria da Silva Souza",
  startsAt: "2026-10-20T13:00:00.000Z", // terça 10:00 em São Paulo
  dentistName: "Dra. Ana Paula",
  procedureName: "Limpeza",
};

describe("renderReminderMessage", () => {
  it("confirms the booking with date, time, dentist and how to answer", () => {
    const text = renderReminderMessage({ ...input, kind: "CONFIRMATION" });
    expect(text).toContain("Olá, Maria!");
    expect(text).toContain("Clínica Sorriso");
    expect(text).toContain("terça-feira, 20/10");
    expect(text).toContain("10:00");
    expect(text).toContain("Dra. Ana Paula");
    expect(text).toContain("Limpeza");
    expect(text).toContain("*1* para confirmar");
    expect(text).toContain("*2* para remarcar");
    expect(text).toContain("*SAIR*");
  });

  it("asks for confirmation in the 24h reminder", () => {
    const text = renderReminderMessage({ ...input, kind: "REMINDER_24H" });
    expect(text).toMatch(/lembrete/i);
    expect(text).toContain("*1* para confirmar");
  });

  it("is short and does not ask anything in the 2h reminder", () => {
    const text = renderReminderMessage({ ...input, kind: "REMINDER_2H" });
    expect(text).toContain("10:00");
    expect(text).not.toContain("*1*");
  });

  it("offers to reschedule after a no-show", () => {
    const text = renderReminderMessage({ ...input, kind: "NO_SHOW_FOLLOWUP" });
    expect(text).toMatch(/sentimos sua falta/i);
    expect(text).toContain("*2*");
  });

  it("separates the greeting, the details and the answer options into paragraphs", () => {
    const text = renderReminderMessage({ ...input, kind: "CONFIRMATION" });
    expect(text.split("\n\n")).toEqual([
      "Olá, Maria!",
      "Sua consulta na *Clínica Sorriso* foi agendada.",
      "📅 terça-feira, 20/10 às 10:00\n🦷 Limpeza\n👤 Dra. Ana Paula",
      "Responda:\n*1* para confirmar\n*2* para remarcar",
      "Para não receber mais mensagens, responda *SAIR*.",
    ]);
  });

  it("falls back to a neutral greeting when the name is blank", () => {
    const text = renderReminderMessage({ ...input, patientName: "  ", kind: "REMINDER_2H" });
    expect(text.startsWith("Olá!")).toBe(true);
  });

  it("drops a leading title from the greeting name", () => {
    const text = renderReminderMessage({ ...input, patientName: "Dr. Carlos Mendes", kind: "REMINDER_2H" });
    expect(text.startsWith("Olá, Carlos!")).toBe(true);
  });
});

describe("sanitizeName", () => {
  it.each([
    ["Maria Souza", "Maria Souza"],
    ["Maria\nSouza\r\n", "Maria Souza"],
    ["*Maria* _Souza_ ~x~ `y`", "Maria Souza x y"],
    ["Joana http://evil.example/a?b=1 Lima", "Joana Lima"],
    ["Joana www.evil.example Lima", "Joana Lima"],
    ["Clínica evil.example/promo", "Clínica"],
    ["a".repeat(100), "a".repeat(60)],
    ["  ", ""],
  ])("cleans %j", (raw, expected) => {
    expect(sanitizeName(raw)).toBe(expected);
  });

  it("keeps a malicious clinic name from adding lines or links to the message", () => {
    const text = renderReminderMessage({ ...input, clinicName: "Sorriso\nhttps://evil.example", kind: "REMINDER_2H" });
    expect(text).not.toMatch(/evil/);
    expect(text).toContain("na *Sorriso*");
  });
});
