const TITLE_PREFIX = /^(dr|dra|sr|sra)\.?\s+/i;

/** The name without a leading title ("Dra. Ana" -> "Ana"). */
export function stripTitle(name: string): string {
  return name.replace(TITLE_PREFIX, "").trim();
}

/** Up to two letters for an avatar: first and last name, ignoring a leading title ("Dra."). */
export function initials(name: string): string {
  const words = stripTitle(name).split(/\s+/).filter(Boolean);
  const first = words[0]?.charAt(0) ?? "";
  const last = words.length > 1 ? (words.at(-1)?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase();
}
