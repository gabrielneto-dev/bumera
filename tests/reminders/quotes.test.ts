import { describe, expect, it } from "vitest";
import { evaluateQuoteGuard } from "@/lib/reminders/guard";
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
