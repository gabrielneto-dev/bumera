import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { parseInput, whatsappInstanceSchema } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

/** The Evolution instance (WhatsApp number) of the clinic, or null while it is not connected. */
export async function getWhatsappInstance(ctx: ServiceContext): Promise<string | null> {
  return (await getWhatsappSettings(ctx)).instance;
}

export interface WhatsappSettings {
  instance: string | null;
  /** What the n8n assistant may answer from (address, hours, payment methods); served by the API. */
  clinicInfo: string;
}

export async function getWhatsappSettings(ctx: ServiceContext): Promise<WhatsappSettings> {
  assertCan(ctx.role, "triggerRule", "read");
  const row = await ctx.db.clinicSettings.findUnique({ where: { organizationId: ctx.organizationId } });
  return { instance: row?.whatsappInstance ?? null, clinicInfo: row?.clinicInfo ?? "" };
}

/**
 * Sets (or clears) the clinic's instance. The name is unique across clinics because it is how an
 * inbound message finds its clinic; the clinic's timings are left as they are.
 */
export async function setWhatsappInstance(ctx: ServiceContext, rawInput: unknown): Promise<string | null> {
  assertCan(ctx.role, "triggerRule", "update");
  const { instance, clinicInfo } = parseInput(whatsappInstanceSchema, rawInput);
  const data = { whatsappInstance: instance, ...(clinicInfo === undefined ? {} : { clinicInfo: clinicInfo || null }) };
  try {
    const row = await ctx.db.clinicSettings.upsert({
      where: { organizationId: ctx.organizationId },
      update: data,
      create: { organizationId: ctx.organizationId, ...data },
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
