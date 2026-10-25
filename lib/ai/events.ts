import type { AiEventKind, PrismaClient } from "@/generated/prisma/client";

/**
 * Counts one thing the AI did, for the quality screen. Best effort: a failure here must never change what the
 * patient receives, so it is swallowed. Only the kind is kept, never the text or the person.
 */
export async function recordAiEvent(prisma: PrismaClient, organizationId: string, kind: AiEventKind): Promise<void> {
  try {
    await prisma.aiEvent.create({ data: { organizationId, kind } });
  } catch {
    // Quality counters are not worth failing a conversation for.
  }
}
