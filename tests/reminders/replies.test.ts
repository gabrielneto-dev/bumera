import { describe, expect, it } from "vitest";
import { evaluateGuard } from "@/lib/reminders/guard";
import { renderReminderMessage } from "@/lib/reminders/messages";
import { REMINDER_KIND_LABEL } from "@/lib/labels";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const appointment = {
  status: "CONFIRMED" as const,
  startsAt: new Date("2026-10-16T17:30:00.000Z"),
  endsAt: new Date("2026-10-16T18:00:00.000Z"),
};
const patient = { consentAt: new Date("2026-10-01T00:00:00.000Z"), doNotContact: false, status: "CONFIRMED" as const };

describe("guard for automatic replies", () => {
  it.each(["REPLY_CONFIRMED", "REPLY_RESCHEDULE"] as const)("lets %s through for a patient who did not opt out", (kind) => {
    expect(evaluateGuard({ kind, appointment, patient }, NOW)).toEqual({ ok: true });
  });

  it("does not require the appointment to be upcoming or live", () => {
    const past = { ...appointment, status: "CANCELLED" as const, startsAt: new Date("2026-10-14T10:00:00.000Z") };
    expect(evaluateGuard({ kind: "REPLY_RESCHEDULE", appointment: past, patient }, NOW)).toEqual({ ok: true });
  });

  it.each(["REPLY_CONFIRMED", "REPLY_RESCHEDULE"] as const)("skips %s once the patient opted out", (kind) => {
    expect(evaluateGuard({ kind, appointment, patient: { ...patient, doNotContact: true } }, NOW)).toMatchObject({
      ok: false,
      status: "SKIPPED",
    });
  });

  it("still sends the opt-out acknowledgement to a patient who has just opted out", () => {
    const optedOut = { ...patient, doNotContact: true };
    expect(evaluateGuard({ kind: "REPLY_OPTED_OUT", appointment, patient: optedOut }, NOW)).toEqual({ ok: true });
  });
});

describe("reply messages", () => {
  const base = {
    clinicName: "Odonto Company",
    patientName: "Gabriel Teste",
    startsAt: "2026-10-21T17:30:00.000Z",
    dentistName: "Dr. Teste",
    procedureName: "Consulta de teste",
  };

  it("confirms the appointment with day and time", () => {
    const text = renderReminderMessage({ ...base, kind: "REPLY_CONFIRMED" });
    expect(text).toContain("Gabriel");
    expect(text).toContain("14:30");
    expect(text).toContain("Dr. Teste");
    expect(text).not.toMatch(/responda/i);
    expect(text).toContain("\n\n");
  });

  it("tells the patient the clinic will get in touch about rescheduling", () => {
    const text = renderReminderMessage({ ...base, kind: "REPLY_RESCHEDULE" });
    expect(text).toContain("Odonto Company");
    expect(text).toMatch(/remarcar/i);
  });

  it("confirms the opt-out without inviting more replies", () => {
    const text = renderReminderMessage({ ...base, kind: "REPLY_OPTED_OUT" });
    expect(text).toContain("Odonto Company");
    expect(text).toMatch(/n[ãa]o vai mais receber/i);
    expect(text).not.toContain("SAIR");
  });

  it("has a label for every reply kind", () => {
    expect(REMINDER_KIND_LABEL.REPLY_CONFIRMED).toBeTruthy();
    expect(REMINDER_KIND_LABEL.REPLY_RESCHEDULE).toBeTruthy();
    expect(REMINDER_KIND_LABEL.REPLY_OPTED_OUT).toBeTruthy();
  });
});
