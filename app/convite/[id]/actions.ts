"use server";

import { headers } from "next/headers";
import type { ActionState } from "@/lib/action-state";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";

/** The invited person joins the clinic and it becomes their active one. */
export async function acceptInvitationAction(invitationId: string): Promise<ActionState> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const accepted = await auth.api.acceptInvitation({ body: { invitationId }, headers: requestHeaders });
    const organizationId = accepted?.member?.organizationId;
    if (!organizationId) throw new AppError("NOT_FOUND", "Convite não encontrado");
    await auth.api.setActiveOrganization({ body: { organizationId }, headers: requestHeaders });
    return "Convite aceito.";
  });
}
