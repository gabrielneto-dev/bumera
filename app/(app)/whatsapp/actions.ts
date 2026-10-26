"use server";

import type { ActionState } from "@/lib/action-state";
import { formOptional } from "@/lib/form-data";
import { runAction } from "@/lib/run-action";
import { getServiceContext } from "@/lib/services/server";
import { setWhatsappInstance } from "@/lib/services/whatsapp";

export async function saveWhatsappAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const instance = formOptional(formData, "instance") ?? null;
    const clinicInfo = String(formData.get("clinicInfo") ?? "");
    await setWhatsappInstance(await getServiceContext(), { instance, clinicInfo });
    return instance ? "WhatsApp da clínica salvo." : "WhatsApp desconectado desta clínica.";
  });
}
