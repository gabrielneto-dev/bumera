"use server";

import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/lib/run-action";
import { changeAppointmentStatus } from "@/lib/services/appointments";
import { confirmPatient } from "@/lib/services/patients";
import { clearConversation } from "@/lib/services/conversations";
import { markInboxHandled } from "@/lib/services/inbox";
import { markInterestHandled } from "@/lib/services/reminders";
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

export async function markInterestHandledAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await markInterestHandled(await getServiceContext(), id);
    return "Atendimento registrado.";
  });
}

export async function markInboxHandledAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await markInboxHandled(await getServiceContext(), id);
    return "Mensagem marcada como respondida.";
  });
}

export async function clearInboxConversationAction(inboundMessageId: string): Promise<ActionState> {
  return runAction(async () => {
    await clearConversation(await getServiceContext(), { inboundMessageId });
    return "Conversa limpa.";
  });
}
