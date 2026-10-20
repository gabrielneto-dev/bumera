import type { PrismaClient } from "@/generated/prisma/client";
import { type ScopedPrisma, scopedPrisma } from "@/lib/tenant-scope";

export interface ServiceKeys {
  /** base64 of 32 bytes: encrypts CPFs at rest. */
  encryption: string;
  /** base64 of 32 bytes: keyed hash for CPF equality lookups. */
  hash: string;
}

/** Everything a service needs; built once per request from the validated session. */
export interface ServiceContext {
  db: ScopedPrisma;
  organizationId: string;
  userId: string;
  /** Member.role, possibly several comma-separated roles. */
  role: string;
  keys: ServiceKeys;
  now: () => Date;
}

export function makeServiceContext(
  prisma: PrismaClient,
  params: Omit<ServiceContext, "db" | "now"> & { now?: () => Date },
): ServiceContext {
  return {
    ...params,
    db: scopedPrisma(prisma, params.organizationId),
    now: params.now ?? (() => new Date()),
  };
}
