import { AppError } from "@/lib/errors";
import { type ClinicRole, clinicRoles } from "@/lib/permissions";

const KNOWN_ROLES: ReadonlySet<string> = new Set(Object.keys(clinicRoles));

/** Member.role may hold several comma-separated roles; unknown ones (e.g. "member") are dropped. */
export function parseRoles(roleField: string): ClinicRole[] {
  return roleField
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is ClinicRole => KNOWN_ROLES.has(role));
}

export function can(roleField: string, resource: string, action: string): boolean {
  return parseRoles(roleField).some((role) => {
    const statements = clinicRoles[role].statements as Record<string, readonly string[] | undefined>;
    return statements[resource]?.includes(action) ?? false;
  });
}

export function assertCan(roleField: string, resource: string, action: string): void {
  if (!can(roleField, resource, action)) {
    throw new AppError("FORBIDDEN", "Você não tem permissão para fazer isso", { resource, action });
  }
}
