"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useState } from "react";
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
import { FormMessage, FormStateProvider, SubmitButton } from "./form-state";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

interface ActionDialogProps {
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "default" | "sm" | "xs";
  title: string;
  description?: string;
  submitLabel: string;
  action: FormAction;
  children: ReactNode;
}

/** A dialog whose body is a form bound to a server action. Closes and refreshes on success. */
export function ActionDialog({
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "default",
  title,
  description,
  submitLabel,
  action,
  children,
}: ActionDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: triggerVariant, size: triggerSize })}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <ActionForm action={action} submitLabel={submitLabel} onSuccess={() => setOpen(false)}>
          {children}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Text values of a submitted form (files are ignored); repeated names become arrays. */
function snapshot(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    const all = formData.getAll(key).filter((value): value is string => typeof value === "string");
    values[key] = all.length === 1 ? (all[0] as string) : all;
  }
  return values;
}

function ActionForm({
  action,
  submitLabel,
  onSuccess,
  children,
}: {
  action: FormAction;
  submitLabel: string;
  onSuccess: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  // Lives inside the dialog content, so errors reset every time the dialog reopens.
  const [state, formAction] = useActionState<ActionState, FormData>(async (previous, formData) => {
    const next = await action(previous, formData);
    if (next.status === "success") {
      onSuccess();
      router.refresh();
    }
    return next.status === "error" ? { ...next, values: snapshot(formData) } : next;
  }, idleState);

  return (
    <FormStateProvider value={state}>
      <form action={formAction} className="space-y-4">
        {children}
        <FormMessage />
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
          <SubmitButton>{submitLabel}</SubmitButton>
        </DialogFooter>
      </form>
    </FormStateProvider>
  );
}
