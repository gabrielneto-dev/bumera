import { describe, expect, it } from "vitest";
import { renderReminderMessage } from "@/lib/reminders/messages";

describe("messages about a dependent", () => {
  const base = { clinicName: "Odonto Company", patientName: "Pedro Souza", startsAt: "2026-10-20T13:00:00.000Z", dentistName: "Dra. Ana", procedureName: "Avaliação", guardianName: "Maria Souza" };

  it("greet the guardian and speak of the patient", () => {
    const confirmation = renderReminderMessage({ ...base, kind: "CONFIRMATION" });
    expect(confirmation.split("\n\n")[0]).toBe("Olá, Maria!");
    expect(confirmation).toContain("A consulta de *Pedro* na *Odonto Company* foi agendada.");
    expect(renderReminderMessage({ ...base, kind: "REMINDER_24H" })).toContain("*Pedro* tem uma consulta");
    expect(renderReminderMessage({ ...base, kind: "REMINDER_2H" })).toContain("a consulta de *Pedro*");
    expect(renderReminderMessage({ ...base, kind: "REPLY_CONFIRMED" })).toContain("Consulta de *Pedro* confirmada");
    expect(renderReminderMessage({ ...base, kind: "REPLY_RESCHEDULE" })).toContain("consulta de *Pedro*");
    expect(renderReminderMessage({ ...base, kind: "NO_SHOW_FOLLOWUP" })).toContain("a falta de *Pedro*");
    expect(renderReminderMessage({ ...base, kind: "REACTIVATION" })).toContain("atendimento de *Pedro*");
  });

  it("stay as they were for an ordinary patient", () => {
    const text = renderReminderMessage({ ...base, guardianName: undefined, patientName: "Maria Souza", kind: "CONFIRMATION" });
    expect(text).toContain("Sua consulta na *Odonto Company* foi agendada.");
  });
});
