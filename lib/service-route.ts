import { fail, failFrom } from "@/lib/api-response";
import { checkServiceKey, configuredServiceKey } from "@/lib/service-auth";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Wraps a service-to-service endpoint (called by n8n with `Authorization: Bearer <SERVICE_API_KEY>`): 503 when the key
 * is not configured, 401 when it is wrong, expected failures mapped by `failFrom`.
 */
export async function serviceRoute(request: Request, run: () => Promise<Response>): Promise<Response> {
  const auth = checkServiceKey(request.headers.get("authorization"), configuredServiceKey());
  if (auth === "unconfigured") return fail(503, "UNAVAILABLE", "Serviço não configurado");
  if (auth === "unauthorized") return fail(401, "UNAUTHORIZED", "Chave de serviço inválida");
  try {
    return await run();
  } catch (error) {
    return failFrom(error);
  }
}

/** The JSON body, or a 413/400 response to return as is. */
export async function readJsonBody(request: Request): Promise<{ body: unknown } | { response: Response }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { response: fail(413, "TOO_LARGE", "Corpo grande demais") };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { response: fail(400, "VALIDATION", "Corpo inválido: envie JSON") };
  }
}
