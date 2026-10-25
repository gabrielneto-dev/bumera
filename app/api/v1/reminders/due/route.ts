import { z } from "zod";
import { fail, failFrom, ok } from "@/lib/api-response";
import { bufferQuietMs, flushBuffered } from "@/lib/inbound/buffer";
import { prisma } from "@/lib/prisma";
import { claimDueReminders } from "@/lib/reminders/dispatch";
import { checkServiceKey, configuredServiceKey } from "@/lib/service-auth";

const MAX_LIMIT = 50;
const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20) });

/** n8n polls this: returns (and claims) reminders that are due, across all clinics. */
export async function GET(request: Request): Promise<Response> {
  const auth = checkServiceKey(request.headers.get("authorization"), configuredServiceKey());
  if (auth === "unconfigured") return fail(503, "UNAVAILABLE", "Serviço não configurado");
  if (auth === "unauthorized") return fail(401, "UNAUTHORIZED", "Chave de serviço inválida");

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return fail(400, "VALIDATION", `limit deve ser um inteiro de 1 a ${MAX_LIMIT}`);

  try {
    // Messages held back by the buffer whose timer was lost (a restart) are answered here, before the replies are handed out.
    const quietMs = bufferQuietMs();
    if (quietMs > 0) await flushBuffered(prisma, new Date(), quietMs).catch((error: unknown) => console.error("inbound buffer flush failed", error instanceof Error ? error.message : error));
    const due = await claimDueReminders(prisma, { now: new Date(), limit: parsed.data.limit });
    return ok(due, { count: due.length });
  } catch (error) {
    return failFrom(error);
  }
}
