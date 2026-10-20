"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { FormMessage, FormStateProvider, SubmitButton, TextField } from "@/components/form/form-state";
import { Button } from "@/components/ui/button";
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

interface EmailVerificationProps {
  email: string;
  requestCode: () => Promise<ActionState>;
  verify: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}

/** Slim notice shown while the e-mail is not verified. */
export function EmailVerificationBanner(props: EmailVerificationProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="border-b bg-secondary/60">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-8">
        <p className="text-secondary-foreground">Seu e-mail ainda não foi verificado.</p>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) router.refresh();
          }}
        >
          <DialogTrigger render={<Button type="button" size="xs" variant="outline" />}>Verificar agora</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Verificar e-mail</DialogTitle>
              <DialogDescription>
                O envio por e-mail ainda não está ligado, então o código aparece aqui na tela.
              </DialogDescription>
            </DialogHeader>
            <VerificationSteps
              {...props}
              onDone={() => {
                setOpen(false); // closing from code does not fire onOpenChange
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function VerificationSteps({ email, requestCode, verify, onDone }: EmailVerificationProps & { onDone: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isRequesting, startRequest] = useTransition();
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, formData) => {
    const next = await verify(previous, formData);
    if (next.status === "success") onDone();
    return next;
  }, idleState);

  function generate() {
    setRequestError(null);
    startRequest(async () => {
      const result = await requestCode();
      if (result.status === "success" && result.output) setCode(result.output);
      else setRequestError(result.message ?? "Não foi possível gerar o código.");
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Endereço: <strong className="text-foreground">{email}</strong>
      </p>
      {code ? (
        <div className="rounded-xl bg-muted px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">Seu código (vale 10 minutos)</p>
          <p className="font-heading text-3xl tracking-[0.3em] tabular-nums">{code}</p>
        </div>
      ) : (
        <Button type="button" onClick={generate} disabled={isRequesting}>
          {isRequesting ? "Gerando…" : "Mostrar o código"}
        </Button>
      )}
      {requestError && (
        <p role="alert" className="text-sm text-destructive">
          {requestError}
        </p>
      )}
      {code && (
        <FormStateProvider value={state}>
          <form action={formAction} className="space-y-4">
            <TextField name="otp" label="Digite o código" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
            <FormMessage />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Depois</DialogClose>
              <SubmitButton>Confirmar</SubmitButton>
            </DialogFooter>
          </form>
        </FormStateProvider>
      )}
    </div>
  );
}
