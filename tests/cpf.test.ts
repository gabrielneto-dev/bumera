import { describe, expect, it } from "vitest";
import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from "@/lib/cpf";

describe("normalizeCpf", () => {
  it("keeps only the digits", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(normalizeCpf(" 529 982 247 25 ")).toBe("52998224725");
  });
});

describe("isValidCpf", () => {
  it("accepts a CPF with correct check digits", () => {
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejects wrong check digits", () => {
    expect(isValidCpf("52998224726")).toBe(false);
    expect(isValidCpf("12345678900")).toBe(false);
  });

  it("rejects repeated digits, wrong length and non-digits", () => {
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("529982247255")).toBe(false);
    expect(isValidCpf("5299822472a")).toBe(false);
  });
});

describe("formatCpf and maskCpf", () => {
  it("formats as 000.000.000-00", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });

  it("masks everything except the last two digits", () => {
    expect(maskCpf("52998224725")).toBe("***.***.***-25");
  });
});
