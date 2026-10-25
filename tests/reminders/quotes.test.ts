import { describe, expect, it } from "vitest";
import { evaluateQuoteGuard } from "@/lib/reminders/guard";
import { renderReminderMessage } from "@/lib/reminders/messages";
import { planQuoteReminders, QUOTE_VALID_DAYS } from "@/lib/reminders/plan";

const DAY = 86_400_000;
const CREATED = new Date("2026-10-20T12:00:00.000Z");
const patient = { consentAt: new Date("2026-10-01T00:00:00.000Z"), doNotContact: false, status: "CONFIRMED" as const };

describe("planQuoteReminders", () => {
  it("plans a follow-up 2 days and another 7 days after the quote", () => {
    expect(planQuoteReminders({ status: "OPEN", createdAt: CREATED, now: CREATED })).toEqual([
      { kind: "QUOTE_FOLLOWUP_1", dueAt: new Date(CREATED.getTime() + 2 * DAY) },
      { kind: "QUOTE_FOLLOWUP_2", dueAt: new Date(CREATED.getTime() + 7 * DAY) },
    ]);
  });

  it("plans nothing once the quote is closed or expired", () => {
    expect(planQuoteReminders({ status: "ACCEPTED", createdAt: CREATED, now: CREATED })).toEqual([]);
    expect(planQuoteReminders({ status: "DECLINED", createdAt: CREATED, now: CREATED })).toEqual([]);
    const late = new Date(CREATED.getTime() + (QUOTE_VALID_DAYS + 1) * DAY);
    expect(planQuoteReminders({ status: "OPEN", createdAt: CREATED, now: late })).toEqual([]);
  });

  it("drops follow-ups whose moment already passed", () => {
    const now = new Date(CREATED.getTime() + 3 * DAY);
    expect(planQuoteReminders({ status: "OPEN", createdAt: CREATED, now }).map((item) => item.kind)).toEqual(["QUOTE_FOLLOWUP_2"]);
  });
});

describe("evaluateQuoteGuard", () => {
  const quote = { status: "OPEN" as const, createdAt: CREATED };
  const now = new Date(CREATED.getTime() + 2 * DAY);

  it("lets a follow-up of an open quote through", () => {
    expect(evaluateQuoteGuard({ quote, patient }, now)).toEqual({ ok: true });
  });

  it.each(["ACCEPTED", "DECLINED"] as const)("cancels it when the quote is %s", (status) => {
    expect(evaluateQuoteGuard({ quote: { ...quote, status }, patient }, now)).toMatchObject({ ok: false, status: "CANCELLED" });
  });

  it("cancels it once the quote expired", () => {
    const expired = new Date(CREATED.getTime() + (QUOTE_VALID_DAYS + 1) * DAY);
    expect(evaluateQuoteGuard({ quote, patient }, expired)).toMatchObject({ ok: false, status: "CANCELLED" });
  });

  it("respects opt-out and consent", () => {
    expect(evaluateQuoteGuard({ quote, patient: { ...patient, doNotContact: true } }, now)).toMatchObject({ ok: false, status: "SKIPPED" });
    expect(evaluateQuoteGuard({ quote, patient: { ...patient, consentAt: null } }, now)).toMatchObject({ ok: false, status: "SKIPPED" });
  });
});

describe("quote messages", () => {
  const base = {
    clinicName: "Odonto Company",
    patientName: "Maria Souza",
    startsAt: "2026-10-20T13:00:00.000Z",
    dentistName: "",
    procedureName: "",
    quoteDescription: "Implante dente 36",
  };

  it.each(["QUOTE_FOLLOWUP_1", "QUOTE_FOLLOWUP_2"] as const)("%s names the quote and offers the two answers", (kind) => {
    const text = renderReminderMessage({ ...base, kind });
    expect(text.split("\n\n")[0]).toBe("Olá, Maria!");
    expect(text).toContain("*Implante dente 36*");
    expect(text).toContain("*Odonto Company*");
    expect(text).toContain("*1* para falar com a equipe");
    expect(text).toContain("*2* para agora não");
    expect(text).toContain("*SAIR*");
  });

  it("does not let the quote description add links or formatting", () => {
    const text = renderReminderMessage({ ...base, quoteDescription: "*Promo* http://evil.example/x", kind: "QUOTE_FOLLOWUP_1" });
    expect(text).not.toMatch(/evil|http/);
    expect(text).toContain("*Promo*");
  });
});
