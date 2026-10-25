import type { AuditAction } from "@/generated/prisma/client";
import { assertCan } from "@/lib/authz";
import type { ServiceContext } from "@/lib/services/context";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export interface AuditEntryDto {
  id: string;
  createdAt: string;
  actorType: "USER" | "SYSTEM";
  actorUserId: string | null;
  action: AuditAction;
  patientId: string | null;
  /** Current name of the patient concerned; "Paciente removido" after an erasure. */
  patientName: string | null;
  entityId: string | null;
  details: unknown;
}

/** The clinic's activity log, newest first, for the administrator. */
export async function listAuditLog(ctx: ServiceContext, options: { patientId?: string; limit?: number } = {}): Promise<AuditEntryDto[]> {
  assertCan(ctx.role, "audit", "read");
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const rows = await ctx.db.auditLog.findMany({
    where: options.patientId ? { patientId: options.patientId } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const patientIds = [...new Set(rows.flatMap((row) => (row.patientId ? [row.patientId] : [])))];
  const patients = patientIds.length ? await ctx.db.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(patients.map((patient) => [patient.id, patient.name]));
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorType: row.actorType,
    actorUserId: row.actorUserId,
    action: row.action,
    patientId: row.patientId,
    patientName: row.patientId ? (names.get(row.patientId) ?? null) : null,
    entityId: row.entityId,
    details: row.details,
  }));
}
