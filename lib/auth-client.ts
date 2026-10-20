import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, clinicRoles } from "@/lib/permissions";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles: clinicRoles })],
});
