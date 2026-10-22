"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { CheckboxField, FormMessage, FormStateProvider, SubmitButton, TextareaField, useActionFormState } from "@/components/form/form-state";
import { type ActionState, idleState } from "@/lib/action-state";
import type { AssistantSettings } from "@/lib/services/assistant";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function SavedMessage() {
  const state = useActionFormState();
  if (state.status !== "success" || !state.message) return null;
  return (
    <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-foreground">
      {state.message}
    </p>
  );
}

/** Opt-in switch, the clinic's acceptance and the information the assistant may answer from. */
export function AssistantForm({ settings, action }: { settings: AssistantSettings; action: FormAction }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, formData) => {
    const next = await action(previous, formData);
    if (next.status === "success") router.refresh();
    return next.status === "error"
      ? { ...next, values: Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string> }
      : next;
  }, idleState);

  return (
    <FormStateProvider value={state}>
      <form action={formAction} className="max-w-2xl space-y-5">
        <fieldset className="space-y-4 rounded-2xl border bg-card p-5">
          <legend className="sr-only">Assistente de IA</legend>
          <div>
            <h2 className="font-medium">Assistente de IA no WhatsApp</h2>
            <p className="text-sm text-muted-foreground">
              Entende respostas escritas com as palavras do paciente (&ldquo;pode ser&rdquo;, &ldquo;não vou poder&rdquo;) e responde dúvidas simples com as
              informações abaixo. O que ele não souber, dor, urgência ou qualquer assunto clínico vai para a secretária, sem a IA responder.
            </p>
          </div>
          <CheckboxField name="enabled" label="Ativar o assistente nesta clínica" defaultChecked={settings.enabled} />
          {!settings.enabled && (
            <CheckboxField
              name="accept"
              label="Aceito que as mensagens dos pacientes sejam enviadas a um provedor de IA externo, com CPF, telefone, e-mail e nome mascarados, sem guardar histórico no provedor."
            />
          )}
          {!settings.serverReady && (
            <p role="note" className="rounded-lg bg-warning/15 px-3 py-2 text-sm">
              O servidor ainda não tem uma IA configurada: ativar aqui não muda nada até isso ser feito. Enquanto isso, as mensagens livres vão para a secretária.
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-4 rounded-2xl border bg-card p-5">
          <legend className="sr-only">Informações da clínica</legend>
          <TextareaField
            name="clinicInfo"
            label="Informações que o assistente pode usar para responder"
            defaultValue={settings.clinicInfo}
            maxLength={2000}
            placeholder="Endereço, horário de atendimento, formas de pagamento, estacionamento, como chegar…"
            hint="Escreva só o que pode ser dito aos pacientes. O assistente responde somente com o que estiver aqui: preços e promoções só se você os escrever."
          />
        </fieldset>

        <FormMessage />
        <SavedMessage />
        <SubmitButton>Salvar</SubmitButton>
      </form>
    </FormStateProvider>
  );
}
