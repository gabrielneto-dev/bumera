"use server";

import type { ActionState } from "@/lib/action-state";
import { formBoolean, formOptional, formString } from "@/lib/form-data";
import { runAction } from "@/lib/run-action";
import { updateAssistantSettings } from "@/lib/services/assistant";
import { getServiceContext } from "@/lib/services/server";

export async function saveAssistantAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const saved = await updateAssistantSettings(await getServiceContext(), {
      enabled: formBoolean(formData, "enabled"),
      clinicInfo: formString(formData, "clinicInfo"),
      accept: formBoolean(formData, "accept"),
      apiKey: formOptional(formData, "apiKey"),
      removeKey: formBoolean(formData, "removeKey"),
    });
    return saved.enabled ? "Assistente de IA ativado." : "Assistente de IA desativado.";
  });
}
