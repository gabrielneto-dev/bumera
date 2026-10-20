"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { AppointmentStatus } from "@/generated/prisma/client";
import type { ActionState } from "@/lib/action-state";

interface Option {
  to: AppointmentStatus;
  label: string;
  cancel?: boolean;
}

const OPTIONS: Record<AppointmentStatus, Option[]> = {
  PENDING: [
    { to: "SCHEDULED", label: "Aprovar" },
    { to: "CANCELLED", label: "Cancelar", cancel: true },
  ],
  SCHEDULED: [
    { to: "CONFIRMED", label: "Confirmar" },
    { to: "COMPLETED", label: "Concluir" },
    { to: "NO_SHOW", label: "Faltou" },
    { to: "CANCELLED", label: "Cancelar", cancel: true },
  ],
  CONFIRMED: [
    { to: "COMPLETED", label: "Concluir" },
    { to: "NO_SHOW", label: "Faltou" },
    { to: "CANCELLED", label: "Cancelar", cancel: true },
  ],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

interface StatusActionsProps {
  appointmentId: string;
  status: AppointmentStatus;
  canUpdate: boolean;
  canCancel: boolean;
  changeStatus: (id: string, to: AppointmentStatus) => Promise<ActionState>;
}

export function StatusActions({ appointmentId, status, canUpdate, canCancel, changeStatus }: StatusActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = OPTIONS[status].filter((option) => (option.cancel ? canCancel : canUpdate));
  if (options.length === 0) return null;

  function run(option: Option) {
    if (option.cancel && !window.confirm("Cancelar esta consulta?")) return;
    setError(null);
    startTransition(async () => {
      const result = await changeStatus(appointmentId, option.to);
      if (result.status === "success") router.refresh();
      else setError(result.message ?? "Não foi possível atualizar.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {options.map((option) => (
          <Button
            key={option.to}
            type="button"
            size="xs"
            variant={option.cancel ? "ghost" : "outline"}
            disabled={isPending}
            onClick={() => run(option)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
