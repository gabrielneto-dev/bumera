const MAX_SLUG_BASE_LENGTH = 40;
const SUFFIX_LENGTH = 4;

/** Lowercase, accent-free, hyphen-separated slug base (no uniqueness suffix). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_BASE_LENGTH)
    .replace(/-+$/g, "");
}

/** Clinic slugs must be unique across tenants, so a short random suffix is appended. */
export function clinicSlug(name: string, random: () => number = Math.random): string {
  const base = slugify(name) || "clinica";
  const suffix = Math.floor(random() * 36 ** SUFFIX_LENGTH)
    .toString(36)
    .padStart(SUFFIX_LENGTH, "0");
  return `${base}-${suffix}`;
}
