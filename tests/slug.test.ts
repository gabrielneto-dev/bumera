import { describe, expect, it } from "vitest";
import { clinicSlug, slugify } from "@/lib/slug";

describe("slugify", () => {
  it("removes accents, lowercases and hyphenates", () => {
    expect(slugify("Clínica Sorriso & Saúde")).toBe("clinica-sorriso-saude");
  });

  it("trims separators and limits the length", () => {
    expect(slugify("  --Odonto--  ")).toBe("odonto");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it("returns an empty string when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("clinicSlug", () => {
  it("appends a 4-character base-36 suffix", () => {
    expect(clinicSlug("Clínica Sorriso", () => 0.5)).toMatch(/^clinica-sorriso-[0-9a-z]{4}$/);
  });

  it("falls back to a default base for unusable names", () => {
    expect(clinicSlug("???", () => 0)).toBe("clinica-0000");
  });
});
