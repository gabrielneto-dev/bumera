import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireClinicSession } from "@/lib/session";
import { makeServiceContext, type ServiceContext } from "@/lib/services/context";

export interface SignedInContext {
  ctx: ServiceContext;
  userName: string;
  clinicName: string;
}

/**
 * Builds the service context of the signed-in user. The role comes from the database
 * (Member), never from the client, and every request re-validates the session.
 * Memoized per request so the layout and the page share one lookup.
 */
export const getSignedInContext = cache(async (): Promise<SignedInContext> => {
  const { user, organizationId } = await requireClinicSession();
  const [member, clinic] = await Promise.all([
    prisma.member.findFirst({ where: { userId: user.id, organizationId }, select: { role: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);
  if (!member || !clinic) redirect("/sign-in");

  const env = getEnv();
  return {
    ctx: makeServiceContext(prisma, {
      organizationId,
      userId: user.id,
      role: member.role,
      keys: { encryption: env.CPF_ENCRYPTION_KEY, hash: env.CPF_HASH_KEY },
    }),
    userName: user.name,
    clinicName: clinic.name,
  };
});

export async function getServiceContext(): Promise<ServiceContext> {
  return (await getSignedInContext()).ctx;
}
