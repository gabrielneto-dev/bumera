import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/organization/access";

/**
 * Clinic roles (decision CTX-DEC-20261017-roles):
 * - admin: owns the clinic account, configures messages/triggers, invites the team
 * - secretary: registers patients, manages the calendar, confirms WhatsApp registrations
 * - dentist: sees own agenda, registers finished procedures
 * Domain resources are declared now so M1 only has to enforce them.
 */
export const statement = {
  ...defaultStatements,
  patient: ["create", "read", "update", "delete"],
  appointment: ["create", "read", "update", "cancel"],
  procedure: ["create", "read", "update", "delete"],
  dentist: ["create", "read", "update", "delete"],
  triggerRule: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const admin = ac.newRole({
  ...adminAc.statements,
  patient: ["create", "read", "update", "delete"],
  appointment: ["create", "read", "update", "cancel"],
  procedure: ["create", "read", "update", "delete"],
  dentist: ["create", "read", "update", "delete"],
  triggerRule: ["read", "update"],
});

export const secretary = ac.newRole({
  patient: ["create", "read", "update"],
  appointment: ["create", "read", "update", "cancel"],
  procedure: ["read"],
  dentist: ["read"],
});

export const dentist = ac.newRole({
  patient: ["read"],
  appointment: ["read", "update"],
  procedure: ["read"],
  dentist: ["read"],
});

export const clinicRoles = { admin, secretary, dentist } as const;
export type ClinicRole = keyof typeof clinicRoles;
