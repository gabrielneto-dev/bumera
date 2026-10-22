import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { isAiConfigured } from "@/lib/ai";
import { AppError } from "@/lib/errors";
import { assistantSettingsSchema, parseInput } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

export interface AssistantSettings {
  enabled: boolean;
  enabledAt: string | null;
  /** What the clinic wrote for the assistant to answer from. */
  clinicInfo: string;
  /** The server has an AI key and model; without them the switch changes nothing. */
  serverReady: boolean;
}

function toSettings(row: { aiEnabled: boolean; aiEnabledAt: Date | null; clinicInfo: string | null } | null): AssistantSettings {
  return {
    enabled: row?.aiEnabled ?? false,
    enabledAt: row?.aiEnabledAt ? row.aiEnabledAt.toISOString() : null,
    clinicInfo: row?.clinicInfo ?? "",
    serverReady: isAiConfigured(),
  };
}

export async function getAssistantSettings(ctx: ServiceContext): Promise<AssistantSettings> {
  assertCan(ctx.role, "triggerRule", "read");
  return toSettings(await ctx.db.clinicSettings.findUnique({ where: { organizationId: ctx.organizationId } }));
}

/**
 * Turns the AI assistant on or off for the clinic and stores the text it may answer from. Turning it on needs
 * the administrator's explicit acceptance (patients' masked messages go to an external provider); the
 * acceptance, its time and who gave it are kept. Staying on does not ask again.
 */
export async function updateAssistantSettings(ctx: ServiceContext, rawInput: unknown): Promise<AssistantSettings> {
  assertCan(ctx.role, "triggerRule", "update");
  const input = parseInput(assistantSettingsSchema, rawInput);
  const current = await ctx.db.clinicSettings.findUnique({ where: { organizationId: ctx.organizationId } });
  const wasOn = current?.aiEnabled ?? false;
  const turningOn = input.enabled && !wasOn;
  if (turningOn && input.accept !== true) {
    throw new AppError("VALIDATION", "Dados inválidos", { issues: [{ path: "accept", message: "Confirme que a clínica aceita enviar as mensagens, com dados pessoais mascarados, ao provedor de IA" }] });
  }
  if (turningOn && !input.clinicInfo) {
    throw new AppError("VALIDATION", "Dados inválidos", { issues: [{ path: "clinicInfo", message: "Escreva as informações que o assistente pode usar para responder" }] });
  }

  const data = {
    aiEnabled: input.enabled,
    clinicInfo: input.clinicInfo || null,
    ...(turningOn ? { aiEnabledAt: ctx.now(), aiEnabledBy: ctx.userId } : {}),
  };
  const row = await ctx.db.clinicSettings.upsert({
    where: { organizationId: ctx.organizationId },
    update: data,
    create: { organizationId: ctx.organizationId, ...data },
  });
  await recordAudit(ctx.db, ctx, {
    action: "AI_SETTINGS_CHANGED",
    details: { enabled: input.enabled, infoChanged: (current?.clinicInfo ?? "") !== input.clinicInfo },
  });
  return toSettings(row);
}
