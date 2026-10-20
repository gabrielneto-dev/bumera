"use server";

import type { ActionState } from "@/lib/action-state";
import { formBoolean, formOptional, formString } from "@/lib/form-data";
import { runAction } from "@/lib/run-action";
import { confirmPatient, createPatient, updatePatient } from "@/lib/services/patients";
import { getServiceContext } from "@/lib/services/server";

export async function createPatientAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getServiceContext();
    await createPatient(ctx, {
      name: formString(formData, "name"),
      phone: formString(formData, "phone"),
      cpf: formOptional(formData, "cpf"),
      birthDate: formOptional(formData, "birthDate"),
      consent: formBoolean(formData, "consent"),
    });
    return "Paciente cadastrado.";
  });
}

export async function updatePatientAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await getServiceContext();
    const input: Record<string, unknown> = {
      name: formString(formData, "name"),
      phone: formString(formData, "phone"),
    };
    const cpf = formOptional(formData, "cpf");
    if (cpf) input.cpf = cpf;
    const birthDate = formOptional(formData, "birthDate");
    if (birthDate) input.birthDate = birthDate;
    await updatePatient(ctx, id, input);
    return "Paciente atualizado.";
  });
}

export async function confirmPatientAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await confirmPatient(await getServiceContext(), id);
    return "Paciente confirmado.";
  });
}
