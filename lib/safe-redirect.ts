/** Accepts only in-app absolute paths, so "?next=" cannot become an open redirect. */
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) return undefined;
  return value;
}
