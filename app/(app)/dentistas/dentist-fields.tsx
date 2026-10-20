import { CheckboxField, FieldError, TextField } from "@/components/form/form-state";
import { WEEKDAY_LABELS } from "@/lib/labels";
import type { DentistDto } from "@/lib/services/dentists";

const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];

export function DentistFields({ dentist }: { dentist?: DentistDto }) {
  const days = dentist?.workDays ?? DEFAULT_DAYS;
  return (
    <>
      <TextField name="name" label="Nome" defaultValue={dentist?.name} required autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <TextField name="workStart" label="Começa às" type="time" defaultValue={dentist?.workStart ?? "08:00"} required />
        <TextField name="workEnd" label="Termina às" type="time" defaultValue={dentist?.workEnd ?? "18:00"} required />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Dias de atendimento</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label, day) => (
            <CheckboxField key={label} name="workDays" value={String(day)} label={label} defaultChecked={days.includes(day)} variant="chip" />
          ))}
        </div>
        <FieldError name="workDays" />
      </fieldset>
      {dentist && <CheckboxField name="active" label="Atendendo (desmarque para tirar da agenda)" defaultChecked={dentist.active} />}
    </>
  );
}
