"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import {
  FormMessage,
  FormStateProvider,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/form/form-state";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type ActionState, idleState } from "@/lib/action-state";

type InviteAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const ROLE_OPTIONS = [
  { value: "secretary", label: "Secretária" },
  { value: "dentist", label: "Dentista" },
];

export function InviteDialog({ action }: { action: InviteAction }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) router.refresh(); // pick up the new pending invitation
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className={buttonVariants()}>Convidar pessoa</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar para a clínica</DialogTitle>
          <DialogDescription>
            O envio por e-mail ainda não está ligado: o link do convite aparece aqui para você copiar e enviar.
          </DialogDescription>
        </DialogHeader>
        <InviteForm action={action} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ action }: { action: InviteAction }) {
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, formData) => {
    const next = await action(previous, formData);
    return next.status === "error" ? { ...next, values: Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string> } : next;
  }, idleState);
  const [copied, setCopied] = useState(false);

  if (state.status === "success" && state.output) {
    const link = state.output;
    return (
      <div className="space-y-4">
        <p className="text-sm">{state.message}</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={link}
            aria-label="Link do convite"
            onFocus={(event) => event.currentTarget.select()}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-muted px-2.5 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A pessoa precisa criar a conta (ou entrar) com o mesmo e-mail do convite. O link vale por 7 dias.
        </p>
        <DialogFooter>
          <DialogClose render={<Button type="button" />}>Concluir</DialogClose>
        </DialogFooter>
      </div>
    );
  }

  return (
    <FormStateProvider value={state}>
      <form action={formAction} className="space-y-4">
        <TextField name="email" label="E-mail da pessoa" type="email" required autoComplete="off" />
        <SelectField name="role" label="Perfil" options={ROLE_OPTIONS} placeholder="Escolha o perfil" required />
        <FormMessage />
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
          <SubmitButton>Criar convite</SubmitButton>
        </DialogFooter>
      </form>
    </FormStateProvider>
  );
}
