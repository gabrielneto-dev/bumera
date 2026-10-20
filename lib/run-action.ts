import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { AppError } from "@/lib/errors";

interface Issue {
  path: string;
  message: string;
}

function fieldErrorsFrom(details: Record<string, unknown> | undefined): Record<string, string> | undefined {
  const issues = details?.issues;
  if (!Array.isArray(issues)) return undefined;
  const errors: Record<string, string> = {};
  for (const issue of issues as Issue[]) {
    if (issue.path && !(issue.path in errors)) errors[issue.path] = issue.message;
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}

/** What a mutation hands back on success: a message, or a message plus something to display. */
export type ActionOutcome = string | { message?: string; output?: string } | void;

/**
 * Runs a mutation and converts expected failures (AppError) into a form-friendly state.
 * Unexpected errors are logged on the server and shown as a generic message.
 */
export async function runAction(fn: () => Promise<ActionOutcome>): Promise<ActionState> {
  try {
    const outcome = await fn();
    if (typeof outcome === "object" && outcome !== null) {
      return { status: "success", message: outcome.message, output: outcome.output };
    }
    return { status: "success", message: outcome ?? undefined };
  } catch (error) {
    unstable_rethrow(error); // redirects / not-found thrown by Next must pass through
    if (error instanceof AppError) {
      const fieldErrors = fieldErrorsFrom(error.details);
      return {
        status: "error",
        code: error.code,
        message: error.code === "VALIDATION" && fieldErrors ? "Confira os campos destacados." : error.message,
        fieldErrors,
      };
    }
    console.error("[action] unexpected error", error);
    return { status: "error", message: "Algo deu errado. Tente novamente em instantes." };
  }
}
