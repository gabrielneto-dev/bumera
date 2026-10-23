import { describe, expect, it } from "vitest";
import { validateAnswer, validatePhrase } from "@/lib/booking/fluid";

const SLOT = "terça-feira, 20/10 às 09:00";
const base = { goal: "offer_slots" as const, required: [SLOT], person: null, material: ["Clinic a", `${SLOT} com Dra. Ana`] };

describe("validatePhrase", () => {
  it("accepts a natural message that carries the real time", () => {
    expect(validatePhrase(`Tenho *${SLOT}* com a Dra. Ana. Serve pra você?`, base)).toBe(`Tenho *${SLOT}* com a Dra. Ana. Serve pra você?`);
  });

  it("rejects a message that drops, rewrites or invents a time", () => {
    expect(validatePhrase("Tenho terça às 9h. Serve?", base)).toBeNull();
    expect(validatePhrase(`${SLOT} ou quarta-feira, 21/10 às 15:00?`, base)).toBeNull();
  });

  it("rejects numbers that were not given, links and unknown placeholders", () => {
    expect(validatePhrase(`${SLOT}. Ligue 3322-1100.`, base)).toBeNull();
    expect(validatePhrase(`${SLOT}. Veja www.exemplo.com`, base)).toBeNull();
    expect(validatePhrase(`${SLOT}. Oi {{NOME}}`, base)).toBeNull();
  });

  it("fills in the patient's name, and refuses the placeholder when no patient may be named", () => {
    const withPatient = { ...base, goal: "confirm" as const, person: "Pedro Souza" };
    expect(validatePhrase(`Posso confirmar para {{PACIENTE}} ${SLOT}? Ele receberá lembretes por WhatsApp.`, withPatient)).toBe(
      `Posso confirmar para Pedro Souza ${SLOT}? Ele receberá lembretes por WhatsApp.`,
    );
    expect(validatePhrase(`Para {{PACIENTE}}: ${SLOT}. Lembretes por WhatsApp, ok?`, { ...base, goal: "confirm" })).toBeNull();
  });

  it("makes the confirmation mention reminders, and the request never claim to be confirmed", () => {
    expect(validatePhrase(`Fechamos ${SLOT}?`, { ...base, goal: "confirm" })).toBeNull();
    expect(validatePhrase("Pedido recebido! A equipe vai confirmar em breve.", { ...base, goal: "requested", required: [] })).not.toBeNull();
    expect(validatePhrase("Pronto, sua consulta está confirmada!", { ...base, goal: "requested", required: [] })).toBeNull();
    expect(validatePhrase("Pedido recebido!", { ...base, goal: "requested", required: [] })).toBeNull();
  });

  it("keeps the list of times line by line and WhatsApp bold, and removes stray markup", () => {
    const text = `Tenho:\n• *${SLOT}*\n• _outro_\n\n\n\nServe?`;
    expect(validatePhrase(text, { ...base, goal: "offer_slots" })).toBe(`Tenho:\n• *${SLOT}*\n• outro\n\nServe?`);
    expect(validatePhrase(`${SLOT} *meio`, base)).toBe(`${SLOT} meio`);
  });

  it("rejects an empty message", () => {
    expect(validatePhrase("   ", { ...base, required: [] })).toBeNull();
  });
});

describe("validateAnswer", () => {
  const info = "Rua das Flores, 100. Abrimos das 8h às 18h.";

  it("keeps a short answer built from the clinic's information", () => {
    expect(validateAnswer("Ficamos na Rua das Flores, 100.", info)).toBe("Ficamos na Rua das Flores, 100.");
  });

  it("drops answers with numbers the clinic never wrote, links, or nothing", () => {
    expect(validateAnswer("A consulta custa 150 reais.", info)).toBeNull();
    expect(validateAnswer("Veja https://exemplo.com/mapa", info)).toBeNull();
    expect(validateAnswer(null, info)).toBeNull();
    expect(validateAnswer("  ", info)).toBeNull();
  });
});
