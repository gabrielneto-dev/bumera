import { describe, expect, it } from "vitest";
import { renderAnswerMessage } from "@/lib/reminders/messages";

describe("messages about a dependent", () => {
  const base = { clinicName: "Odonto Company", patientName: "Pedro Souza", startsAt: "2026-10-20T13:00:00.000Z", dentistName: "Dra. Ana", procedureName: "Avaliação", guardianName: "Maria Souza" };

  it("greet the guardian and speak of the patient", () => {
    const confirmed = renderAnswerMessage({ ...base, kind: "REPLY_CONFIRMED" });
    expect(confirmed.split("\n\n")[0]).toBe("Olá, Maria!");
    expect(renderAnswerMessage({ ...base, kind: "REPLY_CONFIRMED" })).toContain("Consulta de *Pedro* confirmada");
    expect(renderAnswerMessage({ ...base, kind: "REPLY_RESCHEDULE" })).toContain("consulta de *Pedro*");
  });

  it("stay as they were for an ordinary patient", () => {
    const text = renderAnswerMessage({ ...base, guardianName: undefined, patientName: "Maria Souza", kind: "REPLY_RESCHEDULE" });
    expect(text).toContain("Recebemos o seu pedido para remarcar.");
  });
});
