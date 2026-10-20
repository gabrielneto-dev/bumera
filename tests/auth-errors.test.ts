import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { asAppError } from "@/lib/auth-errors";
import { AppError } from "@/lib/errors";

describe("asAppError", () => {
  it("translates known Better Auth codes into a field error in Portuguese", () => {
    const error = new APIError("BAD_REQUEST", {
      message: "User is already invited to this organization",
      code: "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
    });
    const result = asAppError(error, "email");
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).details).toEqual({
      issues: [{ path: "email", message: "Já existe um convite pendente para este e-mail" }],
    });
  });

  it("maps every wrong-code situation to one friendly message", () => {
    for (const code of ["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"]) {
      const result = asAppError(new APIError("BAD_REQUEST", { message: code, code }), "otp") as AppError;
      expect(result.details).toEqual({ issues: [{ path: "otp", message: "Código inválido ou expirado" }] });
    }
  });

  it("falls back to a generic message for unknown API errors without leaking details", () => {
    const result = asAppError(new APIError("BAD_REQUEST", { message: "internal detail", code: "SOMETHING_ELSE" }), "email") as AppError;
    expect(result.details).toEqual({ issues: [{ path: "email", message: "Não foi possível concluir. Tente novamente." }] });
  });

  it("returns other errors untouched", () => {
    const original = new Error("db down");
    expect(asAppError(original, "email")).toBe(original);
    const app = new AppError("FORBIDDEN", "no");
    expect(asAppError(app, "email")).toBe(app);
  });
});
