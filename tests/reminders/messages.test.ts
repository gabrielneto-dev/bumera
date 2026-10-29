import { describe, expect, it } from "vitest";
import { renderAnswerMessage, sanitizeName } from "@/lib/reminders/messages";

const input = {
  clinicName: "Clínica Sorriso",
  patientName: "Maria da Silva Souza",
  startsAt: "2026-10-20T13:00:00.000Z", // terça 10:00 em São Paulo
  dentistName: "Dra. Ana Paula",
  procedureName: "Limpeza",
};

describe("renderAnswerMessage", () => {
  it("falls back to a neutral greeting when the name is blank", () => {
    const text = renderAnswerMessage({ ...input, patientName: "  ", kind: "REPLY_INTERESTED" });
    expect(text.startsWith("Olá!")).toBe(true);
  });

  it("drops a leading title from the greeting name", () => {
    const text = renderAnswerMessage({ ...input, patientName: "Dr. Carlos Mendes", kind: "REPLY_INTERESTED" });
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
    const text = renderAnswerMessage({ ...input, clinicName: "Sorriso\nhttps://evil.example", kind: "REPLY_INTERESTED" });
    expect(text).not.toMatch(/evil/);
    expect(text).toContain("da *Sorriso*");
  });
});
