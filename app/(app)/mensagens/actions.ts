"use server";

import type { ActionState } from "@/lib/action-state";
import { formBoolean, formString } from "@/lib/form-data";
import { runAction } from "@/lib/run-action";
import { updateSettings } from "@/lib/services/settings";
import { getServiceContext } from "@/lib/services/server";

const number = (formData: FormData, key: string): number => Number(formString(formData, key));

export async function updateSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await updateSettings(await getServiceContext(), {
      confirmationEnabled: formBoolean(formData, "confirmationEnabled"),
      reminder1Enabled: formBoolean(formData, "reminder1Enabled"),
      reminder1HoursBefore: number(formData, "reminder1HoursBefore"),
      reminder2Enabled: formBoolean(formData, "reminder2Enabled"),
      reminder2HoursBefore: number(formData, "reminder2HoursBefore"),
      noShowEnabled: formBoolean(formData, "noShowEnabled"),
      noShowDelayHours: number(formData, "noShowDelayHours"),
      quoteFollowup1Days: number(formData, "quoteFollowup1Days"),
      quoteFollowup2Days: number(formData, "quoteFollowup2Days"),
      quoteValidDays: number(formData, "quoteValidDays"),
      quietEnabled: formBoolean(formData, "quietEnabled"),
      quietStartHour: number(formData, "quietStartHour"),
      quietEndHour: number(formData, "quietEndHour"),
      dailySendLimit: number(formData, "dailySendLimit"),
      bookingEnabled: formBoolean(formData, "bookingEnabled"),
    });
    return "Configurações salvas. Os lembretes ainda não enviados já seguem os novos horários.";
  });
}
