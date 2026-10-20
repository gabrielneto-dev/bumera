"use server";

import type { AppointmentStatus } from "@/generated/prisma/client";
import type { SelectOption } from "@/components/form/form-state";
import type { ActionState } from "@/lib/action-state";
import { formString } from "@/lib/form-data";
import { AppError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { formatTime } from "@/lib/dates";
import { bookAppointment, changeAppointmentStatus, freeSlots } from "@/lib/services/appointments";
import { getServiceContext } from "@/lib/services/server";

export type SlotsResult = { ok: true; slots: SelectOption[] } | { ok: false; message: string };

export async function bookAppointmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await bookAppointment(await getServiceContext(), {
      patientId: formString(formData, "patientId"),
      dentistId: formString(formData, "dentistId"),
      procedureId: formString(formData, "procedureId"),
      startsAt: formString(formData, "startsAt"),
    });
    return "Consulta agendada.";
  });
}

export async function changeStatusAction(id: string, to: AppointmentStatus): Promise<ActionState> {
  return runAction(async () => {
    await changeAppointmentStatus(await getServiceContext(), id, to);
    return "Status atualizado.";
  });
}

/** Free start times for a dentist, procedure and day (used by the booking form). */
export async function loadSlotsAction(input: {
  dentistId: string;
  procedureId: string;
  day: string;
}): Promise<SlotsResult> {
  try {
    const slots = await freeSlots(await getServiceContext(), input);
    return { ok: true, slots: slots.map((iso) => ({ value: iso, label: formatTime(iso) })) };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    console.error("[action] loadSlots failed", error);
    return { ok: false, message: "Não foi possível carregar os horários." };
  }
}
