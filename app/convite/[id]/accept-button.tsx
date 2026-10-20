"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { AuthError, AuthSubmit } from "@/components/auth/submit-button";
import type { ActionState } from "@/lib/action-state";

export function AcceptButton({ action }: { action: () => Promise<ActionState> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "success") {
        router.push("/agenda");
        router.refresh();
      } else {
        setError(result.message ?? "Não foi possível aceitar o convite.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <AuthSubmit isPending={isPending} pendingLabel="Entrando…">
        Aceitar convite
      </AuthSubmit>
      <AuthError message={error} />
    </form>
  );
}
