"use server";

import type { ActionState } from "@/lib/action-state";
import { formBoolean, formString } from "@/lib/form-data";
import { runAction } from "@/lib/run-action";
import { createProcedure, updateProcedure } from "@/lib/services/procedures";
import { getServiceContext } from "@/lib/services/server";

function fieldsFrom(formData: FormData) {
  return {
    name: formString(formData, "name"),
    defaultDurationMin: Number(formString(formData, "defaultDurationMin")),
  };
}

export async function createProcedureAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await createProcedure(await getServiceContext(), fieldsFrom(formData));
    return "Procedimento cadastrado.";
  });
}

export async function updateProcedureAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await updateProcedure(await getServiceContext(), id, {
      ...fieldsFrom(formData),
      active: formBoolean(formData, "active"),
    });
    return "Procedimento atualizado.";
  });
}
