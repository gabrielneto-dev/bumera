import { describe, expect, it } from "vitest";
import { parseIntent } from "@/lib/inbound/intent";

describe("parseIntent", () => {
  it.each(["1", " 1 ", "1.", "1!"])("reads %j as confirm", (text) => {
    expect(parseIntent(text)).toBe("CONFIRM");
  });

  it.each(["2", "2."])("reads %j as reschedule", (text) => {
    expect(parseIntent(text)).toBe("RESCHEDULE");
  });

  it.each(["SAIR", "sair", "Sair.", " parar ", "PARE", "cancelar mensagens", "descadastrar"])(
    "reads %j as opt-out",
    (text) => {
      expect(parseIntent(text)).toBe("OPT_OUT");
    },
  );

  it.each(["", "oi", "12", "1 2", "quero sair da fila", "talvez", "3"])("does not guess on %j", (text) => {
    expect(parseIntent(text)).toBe("UNKNOWN");
  });

  it("ignores accents and case", () => {
    expect(parseIntent("SAÍR")).toBe("OPT_OUT");
  });
});
