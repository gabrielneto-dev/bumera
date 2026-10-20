"use server";

import type { ActionState } from "@/lib/action-state";
import { formBoolean, formNumbers, formString } from "@/lib/form-data";
import { runAction } from "@/lib/run-action";
import { createDentist, updateDentist } from "@/lib/services/dentists";
import { getServiceContext } from "@/lib/services/server";

function scheduleFrom(formData: FormData) {
  return {
    name: formString(formData, "name"),
    workStart: formString(formData, "workStart"),
    workEnd: formString(formData, "workEnd"),
    workDays: formNumbers(formData, "workDays"),
  };
}

export async function createDentistAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await createDentist(await getServiceContext(), scheduleFrom(formData));
    return "Dentista cadastrado.";
  });
}

export async function updateDentistAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await updateDentist(await getServiceContext(), id, {
      ...scheduleFrom(formData),
      active: formBoolean(formData, "active"),
    });
    return "Dentista atualizado.";
  });
}
