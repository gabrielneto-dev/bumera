import { describe, expect, it } from "vitest";
import { formatBrPhone, isMobileE164, normalizeBrPhone, phoneCandidates } from "@/lib/phone";

describe("normalizeBrPhone", () => {
  it("converts common mobile formats to E.164", () => {
    expect(normalizeBrPhone("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizeBrPhone("11987654321")).toBe("+5511987654321");
    expect(normalizeBrPhone("+55 11 98765-4321")).toBe("+5511987654321");
    expect(normalizeBrPhone("5511987654321")).toBe("+5511987654321");
  });

  it("accepts landlines", () => {
    expect(normalizeBrPhone("(11) 3456-7890")).toBe("+551134567890");
  });

  it("rejects invalid numbers", () => {
    expect(normalizeBrPhone("123")).toBeNull();
    expect(normalizeBrPhone("")).toBeNull();
    expect(normalizeBrPhone("(00) 98765-4321")).toBeNull();
    expect(normalizeBrPhone("(10) 98765-4321")).toBeNull();
    expect(normalizeBrPhone("(11) 18765-4321")).toBeNull();
    expect(normalizeBrPhone("+1 415 555 2671")).toBeNull();
  });
});

describe("isMobileE164", () => {
  it("is true only for 9-digit mobile numbers", () => {
    expect(isMobileE164("+5511987654321")).toBe(true);
    expect(isMobileE164("+551134567890")).toBe(false);
  });
});

describe("formatBrPhone", () => {
  it("formats mobile and landline numbers for display", () => {
    expect(formatBrPhone("+5511987654321")).toBe("(11) 98765-4321");
    expect(formatBrPhone("+551134567890")).toBe("(11) 3456-7890");
  });
});

describe("phoneCandidates", () => {
  it("adds the ninth digit that older WhatsApp accounts omit", () => {
    expect(phoneCandidates("+551797822073")).toEqual(["+551797822073", "+5517997822073"]);
  });

  it("also tries the number without the ninth digit", () => {
    expect(phoneCandidates("+5517997822073")).toEqual(["+5517997822073", "+551797822073"]);
  });

  it("keeps landlines as they are", () => {
    expect(phoneCandidates("+551733221100")).toEqual(["+551733221100"]);
  });
});
