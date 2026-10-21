import { AppError } from "@/lib/errors";

/** Envelope used by every /api/v1 endpoint: { success, data, error, meta }. */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: Record<string, unknown> | null;
}

export function ok<T>(data: T, meta: Record<string, unknown> | null = null): Response {
  return Response.json({ success: true, data, error: null, meta } satisfies ApiEnvelope<T>);
}

export function fail(status: number, code: string, message: string): Response {
  return Response.json({ success: false, data: null, error: { code, message }, meta: null } satisfies ApiEnvelope<never>, { status });
}

/** Maps expected failures to HTTP; anything else becomes a generic 500 (details only reach the server log). */
export function failFrom(error: unknown): Response {
  if (error instanceof AppError) {
    if (error.code === "NOT_FOUND") return fail(404, "NOT_FOUND", error.message);
    if (error.code === "VALIDATION") return fail(400, "VALIDATION", error.message);
    return fail(409, error.code, error.message);
  }
  console.error("Unexpected API error", error);
  return fail(500, "INTERNAL", "Erro interno");
}
