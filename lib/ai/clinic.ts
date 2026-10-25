import type { PrismaClient } from "@/generated/prisma/client";
import { resolveAiClient } from "@/lib/ai";
import type { AiClient } from "@/lib/ai/types";

/**
 * The AI client for a clinic, or null when the clinic did not opt in or has no usable key: then nothing is
 * ever sent to a provider. `override` replaces the key lookup (tests); the opt-in still applies.
 */
export async function clinicAi(prisma: PrismaClient, organizationId: string, override?: AiClient | null): Promise<AiClient | null> {
  const settings = await prisma.clinicSettings.findUnique({ where: { organizationId } });
  if (!settings?.aiEnabled) return null;
  if (override !== undefined) return override;
  const encryptionKey = process.env.CPF_ENCRYPTION_KEY;
  return encryptionKey ? resolveAiClient({ encryptedKey: settings.aiApiKeyEncrypted, encryptionKey }) : null;
}
