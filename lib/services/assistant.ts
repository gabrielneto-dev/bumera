import { hasAiKey } from "@/lib/ai";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/authz";
import { encryptField } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { assistantSettingsSchema, parseInput } from "@/lib/schemas";
import type { ServiceContext } from "@/lib/services/context";

const KEY_TAIL = 4;

export interface AssistantSettings {
  enabled: boolean;
  enabledAt: string | null;
  /** What the clinic wrote for the assistant to answer from. */
  clinicInfo: string;
  /** The clinic saved its own key. The key itself is never returned. */
  keyConfigured: boolean;
  /** The last characters of the saved key, so the screen can say which one it is. */
  keyLast4: string | null;
  /** An AI can answer for this clinic: it has its own key, or the server has one. */
  ready: boolean;
}

interface SettingsRow {
  aiEnabled: boolean;
  aiEnabledAt: Date | null;
  clinicInfo: string | null;
  aiApiKeyEncrypted: string | null;
  aiApiKeyLast4: string | null;
}

function toSettings(row: SettingsRow | null): AssistantSettings {
  const keyConfigured = Boolean(row?.aiApiKeyEncrypted);
  return {
    enabled: row?.aiEnabled ?? false,
    enabledAt: row?.aiEnabledAt ? row.aiEnabledAt.toISOString() : null,
    clinicInfo: row?.clinicInfo ?? "",
    keyConfigured,
    keyLast4: keyConfigured ? (row?.aiApiKeyLast4 ?? null) : null,
    ready: hasAiKey(keyConfigured),
  };
}

const invalid = (path: string, message: string): AppError => new AppError("VALIDATION", "Dados inválidos", { issues: [{ path, message }] });

export async function getAssistantSettings(ctx: ServiceContext): Promise<AssistantSettings> {
  assertCan(ctx.role, "triggerRule", "read");
  return toSettings(await ctx.db.clinicSettings.findUnique({ where: { organizationId: ctx.organizationId } }));
}

/**
 * Turns the AI assistant on or off for the clinic, stores the text it may answer from and the clinic's own
 * OpenRouter key (encrypted; never returned). Turning it on needs a usable key, some information and the
 * administrator's explicit acceptance (patients' masked messages go to an external provider); the acceptance,
 * its time and who gave it are kept. Staying on does not ask again.
 */
export async function updateAssistantSettings(ctx: ServiceContext, rawInput: unknown): Promise<AssistantSettings> {
  assertCan(ctx.role, "triggerRule", "update");
  const input = parseInput(assistantSettingsSchema, rawInput);
  const current = await ctx.db.clinicSettings.findUnique({ where: { organizationId: ctx.organizationId } });
  const hadKey = Boolean(current?.aiApiKeyEncrypted);
  const keyAfter = input.removeKey ? Boolean(input.apiKey) : input.apiKey ? true : hadKey;

  const turningOn = input.enabled && !(current?.aiEnabled ?? false);
  if (turningOn && !hasAiKey(keyAfter)) throw invalid("apiKey", "Cole a chave da OpenRouter para ativar o assistente");
  if (turningOn && input.accept !== true) {
    throw invalid("accept", "Confirme que a clínica aceita enviar as mensagens, com dados pessoais mascarados, ao provedor de IA");
  }
  if (turningOn && !input.clinicInfo) throw invalid("clinicInfo", "Escreva as informações que o assistente pode usar para responder");

  const keyData = input.apiKey
    ? { aiApiKeyEncrypted: encryptField(input.apiKey, ctx.keys.encryption), aiApiKeyLast4: input.apiKey.slice(-KEY_TAIL) }
    : input.removeKey
      ? { aiApiKeyEncrypted: null, aiApiKeyLast4: null }
      : {};
  const data = {
    aiEnabled: input.enabled,
    clinicInfo: input.clinicInfo || null,
    ...keyData,
    ...(turningOn ? { aiEnabledAt: ctx.now(), aiEnabledBy: ctx.userId } : {}),
  };
  const row = await ctx.db.clinicSettings.upsert({
    where: { organizationId: ctx.organizationId },
    update: data,
    create: { organizationId: ctx.organizationId, ...data },
  });
  await recordAudit(ctx.db, ctx, {
    action: "AI_SETTINGS_CHANGED",
    details: { enabled: input.enabled, infoChanged: (current?.clinicInfo ?? "") !== input.clinicInfo, keyChanged: Boolean(input.apiKey) || (input.removeKey === true && hadKey) },
  });
  return toSettings(row);
}
