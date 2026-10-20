import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { makeServiceContext } from "@/lib/services/context";

export const TEST_KEYS = {
  encryption: randomBytes(32).toString("base64"),
  hash: randomBytes(32).toString("base64"),
};

/** Fixed "now": Thursday 2026-10-15 09:00 local (12:00Z). */
export const NOW = new Date("2026-10-15T12:00:00.000Z");

export function ctxFor(prisma: PrismaClient, organizationId: string, role = "secretary") {
  return makeServiceContext(prisma, {
    organizationId,
    userId: "user_test",
    role,
    keys: TEST_KEYS,
    now: () => NOW,
  });
}
