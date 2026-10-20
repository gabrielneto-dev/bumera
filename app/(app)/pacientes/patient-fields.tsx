import { CheckboxField, TextField } from "@/components/form/form-state";
import type { PatientDto } from "@/lib/services/patients";

/** Shared by the create and edit dialogs. */
export function PatientFields({ patient }: { patient?: PatientDto }) {
  return (
    <>
      <TextField name="name" label="Nome completo" defaultValue={patient?.name} required autoComplete="off" />
      <TextField
        name="phone"
        label="Telefone (WhatsApp)"
        defaultValue={patient?.phoneE164}
        placeholder="(11) 98765-4321"
        inputMode="tel"
        required
        autoComplete="off"
      />
      <TextField
        name="cpf"
        label="CPF (opcional)"
        placeholder="000.000.000-00"
        inputMode="numeric"
        autoComplete="off"
        hint={patient?.cpfMasked ? `Atual: ${patient.cpfMasked}. Preencha só para trocar.` : "Com ou sem pontos e traço."}
      />
      <TextField name="birthDate" label="Data de nascimento (opcional)" type="date" defaultValue={patient?.birthDate ?? undefined} />
      {!patient && <CheckboxField name="consent" label="O paciente aceitou receber mensagens por WhatsApp" />}
    </>
  );
}
