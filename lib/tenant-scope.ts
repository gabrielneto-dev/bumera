import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Tenant isolation (decision CTX-DEC-20261016-saas-multi-tenant): a clinic is a
 * Better Auth organization. All business data must be read and written through
 * `scopedPrisma(prisma, organizationId)`, which
 *  - forces `organizationId` into every filter,
 *  - rejects writes that target another clinic,
 *  - denies models that are not registered as tenant tables.
 * Raw SQL ($queryRaw / $executeRaw) bypasses this and must not be used for tenant data.
 */
const TENANT_FIELD = "organizationId";
const TENANT_RELATION = "organization";

/** Register every tenant-owned model here (Prisma model name, PascalCase). */
const TENANT_MODELS: ReadonlySet<string> = new Set([
  "Dentist",
  "Procedure",
  "Patient",
  "Appointment",
  "Reminder",
  "Quote",
  "ClinicSettings",
  "AuditLog",
  "InboundMessage",
  "Conversation",
]);

const FILTER_OPERATIONS: ReadonlySet<string> = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);
const UNIQUE_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
]);
const CREATE_MANY_OPERATIONS: ReadonlySet<string> = new Set(["createMany", "createManyAndReturn"]);

type Args = Record<string, unknown>;

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function foreignClinicError(): Error {
  return new Error("Operation targets another clinic");
}

/** Throws unless the payload leaves the tenant field alone or sets it to this clinic. */
function assertOwnClinic(data: unknown, organizationId: string): void {
  if (!isRecord(data)) return;
  if (TENANT_RELATION in data) throw foreignClinicError();
  if (!(TENANT_FIELD in data)) return;
  const value = data[TENANT_FIELD];
  const requested = isRecord(value) ? value.set : value;
  if (requested !== organizationId) throw foreignClinicError();
}

function stamp(data: unknown, organizationId: string): Args {
  assertOwnClinic(data, organizationId);
  return { ...(isRecord(data) ? data : {}), [TENANT_FIELD]: organizationId };
}

function scopeArgs(operation: string, args: Args, organizationId: string): Args {
  if (FILTER_OPERATIONS.has(operation)) {
    if ("data" in args) assertOwnClinic(args.data, organizationId);
    const where = isRecord(args.where) ? args.where : {};
    return { ...args, where: { AND: [where, { [TENANT_FIELD]: organizationId }] } };
  }
  if (UNIQUE_OPERATIONS.has(operation)) {
    if ("data" in args) assertOwnClinic(args.data, organizationId);
    const where = isRecord(args.where) ? args.where : {};
    // Prisma accepts extra non-unique filters next to a unique key.
    return { ...args, where: { ...where, [TENANT_FIELD]: organizationId } };
  }
  if (operation === "create") {
    return { ...args, data: stamp(args.data, organizationId) };
  }
  if (CREATE_MANY_OPERATIONS.has(operation)) {
    const rows = Array.isArray(args.data) ? args.data : [args.data];
    return { ...args, data: rows.map((row) => stamp(row, organizationId)) };
  }
  if (operation === "upsert") {
    const where = isRecord(args.where) ? args.where : {};
    assertOwnClinic(args.update, organizationId);
    return {
      ...args,
      where: { ...where, [TENANT_FIELD]: organizationId },
      create: stamp(args.create, organizationId),
    };
  }
  throw new Error(`Operation "${operation}" is not available through the tenant scope`);
}

export function scopedPrisma(client: PrismaClient, organizationId: string) {
  if (!organizationId) {
    throw new Error("scopedPrisma requires a non-empty organizationId");
  }
  return client.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) {
            throw new Error(`Model "${model}" is not available through the tenant scope`);
          }
          const result = await query(scopeArgs(operation, args as Args, organizationId) as typeof args);
          // Prisma returns null when an upsert collides with a row of another clinic
          // instead of throwing; surface it as an error rather than a silent null.
          if (operation === "upsert" && result == null) throw foreignClinicError();
          return result;
        },
      },
    },
  });
}

export type ScopedPrisma = ReturnType<typeof scopedPrisma>;
