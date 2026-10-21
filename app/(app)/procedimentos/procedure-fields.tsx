import { CheckboxField, TextField } from "@/components/form/form-state";
import type { ProcedureDto } from "@/lib/services/procedures";

export function ProcedureFields({ procedure }: { procedure?: ProcedureDto }) {
  return (
    <>
      <TextField name="name" label="Nome" defaultValue={procedure?.name} placeholder="Limpeza, canal, avaliação…" required autoComplete="off" />
      <TextField
        name="defaultDurationMin"
        label="Duração (minutos)"
        type="number"
        min={5}
        max={480}
        step={5}
        defaultValue={procedure?.defaultDurationMin ?? 30}
        required
        hint="Usada para calcular o fim da consulta e os horários livres."
      />
      <TextField
        name="reactivateAfterMonths"
        label="Convidar para voltar após (meses, opcional)"
        type="number"
        min={1}
        max={60}
        defaultValue={procedure?.reactivateAfterMonths ?? undefined}
        hint="Depois de concluir uma consulta deste procedimento, o paciente recebe um convite de retorno. Deixe vazio para não convidar."
      />
      {procedure && <CheckboxField name="active" label="Disponível para agendamento" defaultChecked={procedure.active} />}
    </>
  );
}
