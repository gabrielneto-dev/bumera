import { describe, expect, it } from "vitest";
import { formBoolean, formNumbers, formOptional, formString } from "@/lib/form-data";

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("form data helpers", () => {
  it("formString trims and defaults to an empty string", () => {
    expect(formString(form([["name", "  Ana  "]]), "name")).toBe("Ana");
    expect(formString(form([]), "name")).toBe("");
  });

  it("formOptional returns undefined for empty values", () => {
    expect(formOptional(form([["cpf", "   "]]), "cpf")).toBeUndefined();
    expect(formOptional(form([["cpf", "123"]]), "cpf")).toBe("123");
  });

  it("formBoolean is true only for a ticked checkbox", () => {
    expect(formBoolean(form([["consent", "on"]]), "consent")).toBe(true);
    expect(formBoolean(form([["consent", "off"]]), "consent")).toBe(false);
    expect(formBoolean(form([]), "consent")).toBe(false);
  });

  it("formNumbers collects integer values and ignores the rest", () => {
    const data = form([["days", "1"], ["days", "3"], ["days", "x"], ["days", "2.5"]]);
    expect(formNumbers(data, "days")).toEqual([1, 3]);
  });
});
