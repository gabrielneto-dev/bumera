"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { FormMessage, FormStateProvider, SubmitButton, TextField, useActionFormState } from "@/components/form/form-state";
import { type ActionState, idleState } from "@/lib/action-state";

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

/** The name of the clinic's WhatsApp instance in the Evolution API. */
export function WhatsappForm({ instance, action }: { instance: string | null; action: FormAction }) {
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
      <form action={formAction} className="max-w-xl space-y-4 rounded-2xl border bg-card p-5">
        <TextField
          name="instance"
          label="Nome da instância no Evolution"
          defaultValue={instance ?? ""}
          placeholder="clinica-sorriso"
          autoComplete="off"
          maxLength={40}
          hint="Letras minúsculas, números, - ou _. É o nome combinado com quem instalou o WhatsApp da clínica; deixe vazio para desconectar."
        />
        <FormMessage />
        <SavedMessage />
        <SubmitButton>Salvar</SubmitButton>
      </form>
    </FormStateProvider>
  );
}
