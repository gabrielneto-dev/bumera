"use server";

import type { ActionState } from "@/lib/action-state";
import { formOptional, formString } from "@/lib/form-data";
import { runAction } from "@/lib/run-action";
import { changeQuoteStatus, createQuote } from "@/lib/services/quotes";
import { getServiceContext } from "@/lib/services/server";

export async function createQuoteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const value = formOptional(formData, "value");
    await createQuote(await getServiceContext(), {
      patientId: formString(formData, "patientId"),
      description: formString(formData, "description"),
      value: value === undefined ? undefined : Number(value.replace(",", ".")),
    });
    return "Orçamento registrado. O sistema vai acompanhar o paciente.";
  });
}

export async function closeQuoteAction(id: string, status: "ACCEPTED" | "DECLINED"): Promise<ActionState> {
  return runAction(async () => {
    await changeQuoteStatus(await getServiceContext(), id, status);
    return status === "ACCEPTED" ? "Orçamento marcado como fechado." : "Orçamento marcado como perdido.";
  });
}
