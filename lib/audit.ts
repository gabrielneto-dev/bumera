import type { AuditAction, Prisma } from "@/generated/prisma/client";
import type { ScopedPrisma } from "@/lib/tenant-scope";

type AuditDb = Pick<ScopedPrisma, "auditLog">;

/** Who is acting: a signed-in member, or the app itself (userId null) on a patient's WhatsApp message. */
export interface AuditActor {
  organizationId: string;
  userId: string | null;
}

export interface AuditEntry {
  action: AuditAction;
  patientId?: string;
  entityId?: string;
  /** Names of changed fields and similar. Never names, phones, CPFs, values or message text. */
  details?: Prisma.InputJsonValue;
}

/**
 * Writes one line of the activity log (LGPD: who did what with patient data). Call it inside the same
 * transaction as the change it describes, so the two cannot get out of step.
 */
export async function recordAudit(db: AuditDb, actor: AuditActor, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorType: actor.userId ? "USER" : "SYSTEM",
      actorUserId: actor.userId,
      action: entry.action,
      patientId: entry.patientId ?? null,
      entityId: entry.entityId ?? null,
      details: entry.details,
    },
  });
}
