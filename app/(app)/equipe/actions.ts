"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { auth } from "@/lib/auth";
import { asAppError } from "@/lib/auth-errors";
import { assertCan } from "@/lib/authz";
import { captureEmails } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { formString } from "@/lib/form-data";
import { prisma } from "@/lib/prisma";
import { runAction } from "@/lib/run-action";
import { parseInput } from "@/lib/schemas";
import { getServiceContext } from "@/lib/services/server";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "E-mail inválido" })),
  role: z.enum(["secretary", "dentist"], { error: "Escolha o perfil" }),
});

/** Creates the invitation; the link that would be e-mailed is shown to the admin instead. */
export async function inviteMemberAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getServiceContext();
    assertCan(ctx.role, "invitation", "create");
    const input = parseInput(inviteSchema, { email: formString(formData, "email"), role: formString(formData, "role") });
    const requestHeaders = await headers();

    try {
      const { messages } = await captureEmails(() =>
        auth.api.createInvitation({
          body: { email: input.email, role: input.role, organizationId: ctx.organizationId, resend: true },
          headers: requestHeaders,
        }),
      );
      const link = messages.find((message) => message.kind === "invitation")?.link;
      if (!link) throw new Error("Invitation link was not produced");
      return { message: "Convite criado. Envie o link abaixo para a pessoa convidada.", output: link };
    } catch (error) {
      throw asAppError(error, "email");
    }
  });
}

export async function cancelInvitationAction(invitationId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getServiceContext();
    assertCan(ctx.role, "invitation", "cancel");
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!invitation) throw new AppError("NOT_FOUND", "Convite não encontrado");
    await auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() });
    return "Convite cancelado.";
  });
}

export async function removeMemberAction(memberId: string): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getServiceContext();
    assertCan(ctx.role, "member", "delete");
    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId: ctx.organizationId },
      select: { id: true, userId: true, role: true },
    });
    if (!member) throw new AppError("NOT_FOUND", "Pessoa não encontrada");
    if (member.userId === ctx.userId || member.role.split(",").includes("admin")) {
      throw new AppError("FORBIDDEN", "Não é possível remover um administrador da clínica");
    }
    await auth.api.removeMember({
      body: { memberIdOrEmail: member.id, organizationId: ctx.organizationId },
      headers: await headers(),
    });
    return "Pessoa removida da clínica.";
  });
}
