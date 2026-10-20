import { describe, expect, it } from "vitest";
import { initials } from "@/lib/initials";

describe("initials", () => {
  it("uses first and last name", () => {
    expect(initials("Maria da Silva Souza")).toBe("MS");
  });

  it("ignores a leading title", () => {
    expect(initials("Dra. Ana Paula")).toBe("AP");
  });

  it("returns one letter for a single name", () => {
    expect(initials("marina")).toBe("M");
  });

  it("returns an empty string for blank input", () => {
    expect(initials("   ")).toBe("");
  });
});
