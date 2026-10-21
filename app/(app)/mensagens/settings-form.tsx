"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useActionState } from "react";
import { CheckboxField, FormMessage, FormStateProvider, SubmitButton, TextField, useActionFormState } from "@/components/form/form-state";
import { type ActionState, idleState } from "@/lib/action-state";
import type { ClinicSettings } from "@/lib/reminders/settings";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function Group({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border bg-card p-5">
      <legend className="sr-only">{title}</legend>
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </fieldset>
  );
}

function SavedMessage() {
  const state = useActionFormState();
  if (state.status !== "success" || !state.message) return null;
  return (
    <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-foreground">
      {state.message}
    </p>
  );
}

const numberField = (min: number, max: number) => ({ type: "number" as const, min, max, step: 1, inputMode: "numeric" as const, required: true });

/** Message timings of the clinic, saved as a whole. */
export function SettingsForm({ settings, action }: { settings: ClinicSettings; action: FormAction }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, formData) => {
    const next = await action(previous, formData);
    if (next.status === "success") router.refresh();
    return next.status === "error" ? { ...next, values: Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string> } : next;
  }, idleState);

  return (
    <FormStateProvider value={state}>
      <form action={formAction} className="max-w-2xl space-y-5">
        <Group title="Ao agendar" description="Mensagem enviada ao paciente logo depois de marcar a consulta.">
          <CheckboxField name="confirmationEnabled" label="Enviar a confirmação do agendamento" defaultChecked={settings.confirmationEnabled} />
        </Group>

        <Group title="Antes da consulta" description="Dois lembretes. O primeiro pede a confirmação de quem ainda não confirmou; o segundo vale para todos.">
          <CheckboxField name="reminder1Enabled" label="Enviar o 1º lembrete (pede confirmação)" defaultChecked={settings.reminder1Enabled} />
          <TextField name="reminder1HoursBefore" label="1º lembrete: quantas horas antes" defaultValue={settings.reminder1HoursBefore} {...numberField(1, 168)} />
          <CheckboxField name="reminder2Enabled" label="Enviar o 2º lembrete" defaultChecked={settings.reminder2Enabled} />
          <TextField name="reminder2HoursBefore" label="2º lembrete: quantas horas antes" defaultValue={settings.reminder2HoursBefore} {...numberField(1, 168)} />
        </Group>

        <Group title="Quando o paciente falta" description="Convite para remarcar depois de uma consulta marcada como falta.">
          <CheckboxField name="noShowEnabled" label="Enviar o convite para remarcar" defaultChecked={settings.noShowEnabled} />
          <TextField name="noShowDelayHours" label="Quantas horas depois do fim da consulta" defaultValue={settings.noShowDelayHours} {...numberField(1, 72)} />
        </Group>

        <Group title="Orçamentos" description="Quando o sistema pergunta ao paciente se ficou alguma dúvida e por quanto tempo o orçamento vale.">
          <TextField name="quoteFollowup1Days" label="1º contato: dias depois do orçamento" defaultValue={settings.quoteFollowup1Days} {...numberField(1, 30)} />
          <TextField name="quoteFollowup2Days" label="2º contato: dias depois do orçamento" defaultValue={settings.quoteFollowup2Days} {...numberField(1, 60)} />
          <TextField
            name="quoteValidDays"
            label="Validade do orçamento (dias)"
            defaultValue={settings.quoteValidDays}
            hint="Depois disso o orçamento aparece como expirado e os contatos param."
            {...numberField(1, 90)}
          />
        </Group>

        <p className="text-sm text-muted-foreground">
          O convite para o paciente voltar após um procedimento é configurado em cada procedimento, na tela Procedimentos.
        </p>
        <FormMessage />
        <SavedMessage />
        <SubmitButton>Salvar configurações</SubmitButton>
      </form>
    </FormStateProvider>
  );
}
