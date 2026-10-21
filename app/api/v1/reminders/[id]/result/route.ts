import { z } from "zod";
import { fail, failFrom, ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { recordReminderResult } from "@/lib/reminders/dispatch";
import { checkServiceKey, configuredServiceKey } from "@/lib/service-auth";

const MAX_BODY_BYTES = 4096;
const attempt = z.number().int().min(1).max(100);
const bodySchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("sent"), attempt }),
  z.object({ outcome: z.literal("failed"), attempt, error: z.string().max(2000).optional() }),
]);

/** n8n reports whether the claimed reminder was delivered. Safe to repeat. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = checkServiceKey(request.headers.get("authorization"), configuredServiceKey());
  if (auth === "unconfigured") return fail(503, "UNAVAILABLE", "Serviço não configurado");
  if (auth === "unauthorized") return fail(401, "UNAUTHORIZED", "Chave de serviço inválida");

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return fail(413, "TOO_LARGE", "Corpo grande demais");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // reported below as a validation error
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION", 'Corpo inválido: use {"outcome":"sent","attempt":N} ou {"outcome":"failed","attempt":N,"error":"..."}');
  }

  try {
    const { id } = await context.params;
    return ok(await recordReminderResult(prisma, id, parsed.data, new Date()));
  } catch (error) {
    return failFrom(error);
  }
}
