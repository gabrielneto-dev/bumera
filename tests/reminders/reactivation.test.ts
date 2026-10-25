import { describe, expect, it } from "vitest";
import { evaluateGuard } from "@/lib/reminders/guard";
import { renderReminderMessage } from "@/lib/reminders/messages";
import { planReminders } from "@/lib/reminders/plan";

const NOW = new Date("2027-04-20T12:00:00.000Z");
const completed = {
  status: "COMPLETED" as const,
  startsAt: new Date("2026-10-20T13:00:00.000Z"),
  endsAt: new Date("2026-10-20T13:30:00.000Z"),
};
const patient = { consentAt: new Date("2026-10-01T00:00:00.000Z"), doNotContact: false, status: "CONFIRMED" as const };

describe("planReminders for reactivation", () => {
  it("plans a reactivation N months after a completed appointment", () => {
    const planned = planReminders({ ...completed, now: new Date("2026-10-20T14:00:00.000Z"), reactivateAfterMonths: 6 });
    expect(planned).toEqual([{ kind: "REACTIVATION", dueAt: new Date("2027-04-20T13:30:00.000Z") }]);
  });

  it("plans nothing when the procedure has no reactivation period", () => {
    expect(planReminders({ ...completed, now: NOW, reactivateAfterMonths: null })).toEqual([]);
    expect(planReminders({ ...completed, now: NOW })).toEqual([]);
  });

  it("plans nothing for an appointment that was not completed", () => {
    expect(planReminders({ ...completed, status: "CANCELLED", now: NOW, reactivateAfterMonths: 6 })).toEqual([]);
  });

  it("clamps the month arithmetic at the end of short months", () => {
    const planned = planReminders({
      status: "COMPLETED",
      startsAt: new Date("2026-08-31T13:00:00.000Z"),
      endsAt: new Date("2026-08-31T13:30:00.000Z"),
      now: new Date("2026-09-01T00:00:00.000Z"),
      reactivateAfterMonths: 6,
    });
    expect(planned[0]?.dueAt.toISOString().slice(0, 10)).toBe("2027-02-28");
  });
});

describe("guard for reactivation", () => {
  const input = { kind: "REACTIVATION" as const, appointment: completed, patient };

  it("lets it through when the patient has nothing booked", () => {
    expect(evaluateGuard({ ...input, patientHasUpcomingAppointment: false }, NOW)).toEqual({ ok: true });
  });

  it("cancels it when the patient already booked a new appointment", () => {
    expect(evaluateGuard({ ...input, patientHasUpcomingAppointment: true }, NOW)).toMatchObject({
      ok: false,
      status: "CANCELLED",
    });
  });

  it("cancels it when the original appointment is no longer completed", () => {
    const reopened = { ...completed, status: "NO_SHOW" as const };
    expect(evaluateGuard({ ...input, appointment: reopened }, NOW)).toMatchObject({ ok: false, status: "CANCELLED" });
  });

  it("respects opt-out and consent", () => {
    expect(evaluateGuard({ ...input, patient: { ...patient, doNotContact: true } }, NOW)).toMatchObject({ ok: false, status: "SKIPPED" });
    expect(evaluateGuard({ ...input, patient: { ...patient, consentAt: null } }, NOW)).toMatchObject({ ok: false, status: "SKIPPED" });
  });

  it("treats the two campaign replies like other replies", () => {
    for (const kind of ["REPLY_INTERESTED", "REPLY_DECLINED"] as const) {
      expect(evaluateGuard({ kind, appointment: completed, patient }, NOW)).toEqual({ ok: true });
      expect(evaluateGuard({ kind, appointment: completed, patient: { ...patient, doNotContact: true } }, NOW)).toMatchObject({ ok: false });
    }
  });
});

describe("reactivation messages", () => {
  const base = {
    clinicName: "Odonto Company",
    patientName: "Maria Souza",
    startsAt: "2026-10-20T13:00:00.000Z",
    dentistName: "Dr. Teste",
    procedureName: "Limpeza",
  };

  it("invites the patient back with the two answers and the opt-out", () => {
    const text = renderReminderMessage({ ...base, kind: "REACTIVATION" });
    expect(text.split("\n\n")[0]).toBe("Olá, Maria!");
    expect(text).toContain("*Odonto Company*");
    expect(text).toContain("Limpeza");
    expect(text).toContain("*1* para agendar");
    expect(text).toContain("*2* para agora não");
    expect(text).toContain("*SAIR*");
  });

  it("acknowledges interest and a refusal", () => {
    expect(renderReminderMessage({ ...base, kind: "REPLY_INTERESTED" })).toMatch(/entra em contato/);
    const declined = renderReminderMessage({ ...base, kind: "REPLY_DECLINED" });
    expect(declined).toMatch(/quando precisar/i);
    expect(declined).not.toContain("*1*");
  });
});
