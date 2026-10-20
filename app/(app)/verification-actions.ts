"use server";

import type { ActionState } from "@/lib/action-state";
import { auth } from "@/lib/auth";
import { asAppError } from "@/lib/auth-errors";
import { captureEmails } from "@/lib/email";
import { formString } from "@/lib/form-data";
import { runAction } from "@/lib/run-action";
import { getSignedInContext } from "@/lib/services/server";

/**
 * Generates the e-mail verification code for the signed-in user's own address and shows it on
 * screen (no e-mail provider yet). It never accepts an address from the client.
 */
export async function requestVerificationCodeAction(): Promise<ActionState> {
  return runAction(async () => {
    const { userEmail } = await getSignedInContext();
    const { messages } = await captureEmails(() =>
      auth.api.sendVerificationOTP({ body: { email: userEmail, type: "email-verification" } }),
    );
    const code = messages.find((message) => message.kind === "verification-code")?.code;
    if (!code) throw new Error("Verification code was not produced");
    return { message: "Código gerado.", output: code };
  });
}

export async function verifyEmailCodeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { userEmail } = await getSignedInContext();
    try {
      await auth.api.verifyEmailOTP({ body: { email: userEmail, otp: formString(formData, "otp") } });
    } catch (error) {
      throw asAppError(error, "otp");
    }
    return "E-mail verificado.";
  });
}
