import { APIError } from "better-auth/api";
import { AppError } from "@/lib/errors";

const MESSAGES: Record<string, string> = {
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "Esta pessoa já faz parte da clínica",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "Já existe um convite pendente para este e-mail",
  INVALID_OTP: "Código inválido ou expirado",
  OTP_EXPIRED: "Código inválido ou expirado",
  TOO_MANY_ATTEMPTS: "Código inválido ou expirado",
};
const FALLBACK_MESSAGE = "Não foi possível concluir. Tente novamente.";

function codeOf(error: APIError): string | undefined {
  const body = error.body as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : undefined;
}

/**
 * Converts a Better Auth API failure into a form-friendly AppError tied to one field.
 * Anything else is returned unchanged for the caller to re-throw.
 */
export function asAppError(error: unknown, path: string): unknown {
  if (!(error instanceof APIError)) return error;
  const code = codeOf(error);
  const message = (code && MESSAGES[code]) || FALLBACK_MESSAGE;
  return new AppError("VALIDATION", "Dados inválidos", { issues: [{ path, message }] });
}
