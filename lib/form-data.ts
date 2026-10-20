/** Trimmed string value of a form field ("" when missing). */
export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Trimmed string value, or undefined when the field is empty. */
export function formOptional(formData: FormData, key: string): string | undefined {
  return formString(formData, key) || undefined;
}

export function formBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/** Integer values of every field with this name (e.g. weekday checkboxes). */
export function formNumbers(formData: FormData, key: string): number[] {
  return formData
    .getAll(key)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
}
