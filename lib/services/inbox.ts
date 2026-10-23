import type { InboundReason } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import type { ServiceContext } from "@/lib/services/context";

const LIST_LIMIT = 100;

export interface InboxItemDto {
  id: string;
  text: string;
  reason: InboundReason;
  createdAt: string;
  /** Null for a first contact who is not a patient yet: the phone is then the only way to answer. */
  patient: { id: string; name: string; phoneE164: string } | null;
  phoneE164: string;
}

/** Messages from patients that wait for a person to answer, oldest first. */
export async function listInbox(ctx: ServiceContext): Promise<InboxItemDto[]> {
  assertCan(ctx.role, "patient", "update");
  const rows = await ctx.db.inboundMessage.findMany({
    where: { status: "OPEN" },
    include: { patient: { select: { id: true, name: true, phoneE164: true } } },
    orderBy: { createdAt: "asc" },
    take: LIST_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    text: row.text ?? "",
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    patient: row.patient,
    phoneE164: row.patient?.phoneE164 ?? row.phoneE164 ?? "",
  }));
}

/** The team answered the patient (by phone or WhatsApp): the message leaves the list and its text is erased. */
export async function markInboxHandled(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.role, "patient", "update");
  const row = await ctx.db.inboundMessage.findUnique({ where: { id } });
  if (!row) throw new AppError("NOT_FOUND", "Mensagem não encontrada", { resource: "inbound_message" });
  if (row.status === "HANDLED") return;
  await ctx.db.$transaction(async (tx) => {
    await tx.inboundMessage.update({ where: { id }, data: { status: "HANDLED", handledAt: ctx.now(), text: null } });
    await recordAudit(tx, ctx, { action: "INBOUND_MESSAGE_HANDLED", patientId: row.patientId ?? undefined, entityId: id });
  });
}
