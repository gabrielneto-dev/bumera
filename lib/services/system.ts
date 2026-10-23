import type { PrismaClient } from "@/generated/prisma/client";
import { SYSTEM_USER_ID } from "@/lib/audit";
import { makeServiceContext, type ServiceContext } from "@/lib/services/context";

/**
 * A service context for the app acting on its own (the WhatsApp booking dialog): it has the secretary's
 * permissions and is recorded as the system in the activity log. The keys are only used for CPFs, which a
 * WhatsApp booking never handles.
 */
export function makeSystemContext(prisma: PrismaClient, organizationId: string, now: Date): ServiceContext {
  return makeServiceContext(prisma, {
    organizationId,
    userId: SYSTEM_USER_ID,
    role: "secretary",
    keys: { encryption: process.env.CPF_ENCRYPTION_KEY ?? "", hash: process.env.CPF_HASH_KEY ?? "" },
    now: () => now,
  });
}
