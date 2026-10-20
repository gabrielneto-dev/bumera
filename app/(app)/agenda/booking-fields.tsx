"use client";

import { useState, useTransition } from "react";
import { SelectField, type SelectOption, TextField } from "@/components/form/form-state";
import type { SlotsResult } from "./actions";

interface BookingFieldsProps {
  patients: SelectOption[];
  dentists: SelectOption[];
  procedures: SelectOption[];
  defaultDay: string;
  loadSlots: (input: { dentistId: string; procedureId: string; day: string }) => Promise<SlotsResult>;
}

/** Booking form body: free times are loaded whenever dentist, procedure or day change. */
export function BookingFields({ patients, dentists, procedures, defaultDay, loadSlots }: BookingFieldsProps) {
  const [choice, setChoice] = useState({ dentistId: "", procedureId: "", day: defaultDay });
  const [slots, setSlots] = useState<SelectOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();

  function update(change: Partial<typeof choice>) {
    const next = { ...choice, ...change };
    setChoice(next);
    setSlots([]);
    setMessage(null);
    if (!next.dentistId || !next.procedureId || !next.day) return;
    startLoading(async () => {
      const result = await loadSlots(next);
      if (result.ok) {
        setSlots(result.slots);
        if (result.slots.length === 0) setMessage("Sem horários livres neste dia.");
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <>
      <SelectField
        name="patientId"
        label="Paciente"
        options={patients}
        placeholder="Escolha o paciente"
        required
        hint="Não está na lista? Cadastre em Pacientes."
      />
      <SelectField name="dentistId" label="Dentista" options={dentists} placeholder="Escolha o dentista" required onChange={(dentistId) => update({ dentistId })} />
      <SelectField name="procedureId" label="Procedimento" options={procedures} placeholder="Escolha o procedimento" required onChange={(procedureId) => update({ procedureId })} />
      <TextField name="day" label="Dia" type="date" defaultValue={defaultDay} required onChange={(event) => update({ day: event.target.value })} />
      <SelectField
        name="startsAt"
        label="Horário"
        options={slots}
        placeholder={isLoading ? "Buscando horários…" : "Escolha o horário"}
        required
        hint={message ?? undefined}
      />
    </>
  );
}
