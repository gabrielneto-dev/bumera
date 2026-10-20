"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

export function AcceptButton({ action }: { action: () => Promise<ActionState> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
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
    <div className="space-y-2">
      <Button type="button" className="w-full" disabled={isPending} onClick={onClick}>
        {isPending ? "Entrando…" : "Aceitar convite"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
