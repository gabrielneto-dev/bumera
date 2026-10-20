import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Validates the session on the server (cookie presence alone is not proof). */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session;
}

/** Requires a signed-in user with an active clinic (Better Auth organization). */
export async function requireClinicSession() {
  const session = await requireSession();
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) redirect("/onboarding");
  return { ...session, organizationId };
}
