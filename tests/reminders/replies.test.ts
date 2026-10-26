import { describe, expect, it } from "vitest";
import { renderReminderMessage } from "@/lib/reminders/messages";


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

});
