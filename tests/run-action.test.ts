import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  // Mimics Next: redirect/not-found errors carry a digest and must be re-thrown.
  unstable_rethrow: (error: unknown) => {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
  },
}));

import { AppError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAction", () => {
  it("returns a success state with the message", async () => {
    expect(await runAction(async () => "Feito.")).toEqual({ status: "success", message: "Feito." });
    expect(await runAction(async () => undefined)).toEqual({ status: "success", message: undefined });
    expect(await runAction(async () => ({ message: "Convite criado.", output: "https://x/convite/1" }))).toEqual({
      status: "success",
      message: "Convite criado.",
      output: "https://x/convite/1",
    });
  });

  it("turns validation errors into field errors and a short summary", async () => {
    const state = await runAction(async () => {
      throw new AppError("VALIDATION", "Dados inválidos", {
        issues: [
          { path: "cpf", message: "CPF inválido" },
          { path: "cpf", message: "ignored duplicate" },
          { path: "phone", message: "Telefone inválido" },
        ],
      });
    });
    expect(state).toMatchObject({
      status: "error",
      code: "VALIDATION",
      message: "Confira os campos destacados.",
      fieldErrors: { cpf: "CPF inválido", phone: "Telefone inválido" },
    });
  });

  it("keeps the message of other expected errors", async () => {
    const state = await runAction(async () => {
      throw new AppError("SLOT_TAKEN", "Horário ocupado");
    });
    expect(state).toMatchObject({ status: "error", code: "SLOT_TAKEN", message: "Horário ocupado" });
    expect(state.fieldErrors).toBeUndefined();
  });

  it("hides unexpected errors behind a generic message and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await runAction(async () => {
      throw new Error("db password leaked");
    });
    expect(state.status).toBe("error");
    expect(state.message).not.toContain("password");
    expect(log).toHaveBeenCalled();
  });

  it("re-throws Next control-flow errors (redirects)", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/sign-in" });
    await expect(
      runAction(async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });
});
