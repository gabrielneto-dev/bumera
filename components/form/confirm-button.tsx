"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

interface ConfirmButtonProps {
  label: string;
  variant?: "default" | "outline" | "ghost";
  /** Asks with the browser's confirm dialog first (for destructive actions). */
  confirmMessage?: string;
  action: () => Promise<ActionState>;
}

/** One-click server action with inline error feedback; refreshes the page on success. */
export function ConfirmButton({ label, variant = "default", confirmMessage, action }: ConfirmButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "success") router.refresh();
      else setError(result.message ?? "Não foi possível concluir.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant={variant} disabled={isPending} onClick={onClick}>
        {isPending && <Loader2 className="animate-spin" aria-hidden />}
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
