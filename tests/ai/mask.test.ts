import { describe, expect, it } from "vitest";
import { maskPersonalData } from "@/lib/ai/mask";

describe("maskPersonalData", () => {
  it("hides CPFs written with or without punctuation", () => {
    expect(maskPersonalData("Meu CPF é 529.982.247-25, ok?", [])).toBe("Meu CPF é [CPF], ok?");
    expect(maskPersonalData("cpf 52998224725", [])).toBe("cpf [CPF]");
  });

  it("hides phone numbers in the usual Brazilian formats", () => {
    for (const phone of ["(17) 99782-2073", "17997822073", "+55 17 99782-2073", "17 9978 2073", "5517997822073"]) {
      expect(maskPersonalData(`Me ligue no ${phone} por favor`, [])).toBe("Me ligue no [TELEFONE] por favor");
    }
  });

  it("hides e-mail addresses", () => {
    expect(maskPersonalData("escreva para maria.souza@exemplo.com.br", [])).toBe("escreva para [EMAIL]");
  });

  it("hides the patient's name and its parts, ignoring case and accents", () => {
    const masked = maskPersonalData("Aqui é a Maria da Silva Souza, a MARIA quer remarcar. Falem com José.", ["Maria da Silva Souza", "José"]);
    expect(masked).toBe("Aqui é a [NOME], a [NOME] quer remarcar. Falem com [NOME].");
    expect(maskPersonalData("sou o jose", ["José"])).toBe("sou o [NOME]");
  });

  it("masks the whole name first and ignores short connecting words such as da and de", () => {
    expect(maskPersonalData("Ana da Silva vai de manhã, a Silva também", ["Ana da Silva"])).toBe("[NOME] vai de manhã, a [NOME] também");
    expect(maskPersonalData("vou de manhã", ["Ana de Souza Dias"])).toBe("vou de manhã");
  });

  it("leaves ordinary text untouched", () => {
    expect(maskPersonalData("Pode ser na sexta às 14h? Vocês aceitam cartão?", ["Maria"])).toBe("Pode ser na sexta às 14h? Vocês aceitam cartão?");
  });
});
