import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { parseInput, whatsappInstanceSchema } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

/** The Evolution instance (WhatsApp number) of the clinic, or null while it is not connected. */
export async function getWhatsappInstance(ctx: ServiceContext): Promise<string | null> {
  assertCan(ctx.role, "triggerRule", "read");
  const row = await ctx.db.clinicSettings.findUnique({ where: { organizationId: ctx.organizationId } });
  return row?.whatsappInstance ?? null;
}

/**
 * Sets (or clears) the clinic's instance. The name is unique across clinics because it is how an
 * inbound message finds its clinic; the clinic's timings are left as they are.
 */
export async function setWhatsappInstance(ctx: ServiceContext, rawInput: unknown): Promise<string | null> {
  assertCan(ctx.role, "triggerRule", "update");
  const { instance } = parseInput(whatsappInstanceSchema, rawInput);
  try {
    const row = await ctx.db.clinicSettings.upsert({
      where: { organizationId: ctx.organizationId },
      update: { whatsappInstance: instance },
      create: { organizationId: ctx.organizationId, whatsappInstance: instance },
    });
    await recordAudit(ctx.db, ctx, { action: "WHATSAPP_CHANGED", details: { connected: row.whatsappInstance !== null } });
    return row.whatsappInstance;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("DUPLICATE_WHATSAPP", "Este nome de instância já é usado por outra clínica");
    }
    throw error;
  }
}

/** Whether the clinic has a WhatsApp instance set; any signed-in role may ask, to explain why messages wait. */
export async function hasWhatsappInstance(ctx: ServiceContext): Promise<boolean> {
  const row = await ctx.db.clinicSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { whatsappInstance: true } });
  return Boolean(row?.whatsappInstance);
}
