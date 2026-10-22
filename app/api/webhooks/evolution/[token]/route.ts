import { fail, failFrom, ok } from "@/lib/api-response";
import { parseEvolutionMessage } from "@/lib/inbound/evolution";
import { handleInboundMessage } from "@/lib/inbound/handle";
import { prisma } from "@/lib/prisma";
import { checkWebhookToken, configuredWebhookToken } from "@/lib/webhook-auth";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Evolution API delivers WhatsApp events here. The secret in the URL identifies the sender.
 * Anything that is not a patient's text reply is acknowledged with 200 so Evolution does not retry it.
 */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await context.params;
  const auth = checkWebhookToken(token, configuredWebhookToken());
  if (auth === "unconfigured") return fail(503, "UNAVAILABLE", "Serviço não configurado");
  if (auth === "unauthorized") return fail(401, "UNAUTHORIZED", "Token inválido");

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return fail(413, "TOO_LARGE", "Corpo grande demais");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "VALIDATION", "Corpo inválido");
  }

  const message = parseEvolutionMessage(body);
  if (!message) return ok({ outcome: "IGNORED" });

  try {
    // The instance that received the message says which clinic it belongs to.
    const clinic = await prisma.clinicSettings.findUnique({
      where: { whatsappInstance: message.instance },
      select: { organizationId: true },
    });
    if (!clinic) return ok({ outcome: "UNKNOWN_INSTANCE" });
    return ok(await handleInboundMessage(prisma, { ...message, organizationId: clinic.organizationId }, new Date()));
  } catch (error) {
    return failFrom(error);
  }
}
