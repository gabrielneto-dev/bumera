"use server";

import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/lib/run-action";
import { changeAppointmentStatus } from "@/lib/services/appointments";
import { confirmPatient } from "@/lib/services/patients";
import { getServiceContext } from "@/lib/services/server";

export async function approveAppointmentAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await changeAppointmentStatus(await getServiceContext(), id, "SCHEDULED");
    return "Consulta aprovada.";
  });
}

export async function rejectAppointmentAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await changeAppointmentStatus(await getServiceContext(), id, "CANCELLED");
    return "Consulta recusada.";
  });
}

export async function approvePatientAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await confirmPatient(await getServiceContext(), id);
    return "Paciente confirmado.";
  });
}
