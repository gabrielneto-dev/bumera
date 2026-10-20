import { Clock, UserRound } from "lucide-react";
import { AvatarInitials } from "@/components/avatar-initials";
import { EmptyState } from "@/components/empty-state";
import { ActionDialog } from "@/components/form/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { describeWorkDays, WEEKDAY_LABELS } from "@/lib/labels";
import { listDentists } from "@/lib/services/dentists";
import { getServiceContext } from "@/lib/services/server";
import { cn } from "@/lib/utils";
import { createDentistAction, updateDentistAction } from "./actions";
import { DentistFields } from "./dentist-fields";

export const metadata = { title: "Dentistas" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default async function DentistasPage() {
  const ctx = await getServiceContext();
  const dentists = await listDentists(ctx, { includeInactive: true });
  const canManage = can(ctx.role, "dentist", "update");

  return (
    <section className="space-y-6">
      <PageHeader
        title="Dentistas"
        description="Cada dentista tem a própria agenda e horário de atendimento."
        actions={
          can(ctx.role, "dentist", "create") ? (
            <ActionDialog triggerLabel="Novo dentista" title="Novo dentista" submitLabel="Cadastrar" action={createDentistAction}>
              <DentistFields />
            </ActionDialog>
          ) : null
        }
      />

      {dentists.length === 0 ? (
        <EmptyState icon={UserRound} title="Nenhum dentista cadastrado">
          Cadastre os dentistas da clínica para liberar a agenda.
        </EmptyState>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dentists.map((dentist) => (
            <StaggerItem
              key={dentist.id}
              className={cn(
                "flex flex-col gap-5 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-sm",
                !dentist.active && "bg-card/60",
              )}
            >
              <div className="flex items-start gap-3">
                <AvatarInitials name={dentist.name} muted={!dentist.active} className="size-11 text-lg" />
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium text-balance break-words", !dentist.active && "text-muted-foreground")}>{dentist.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                    <Clock className="size-3.5" aria-hidden />
                    {dentist.workStart}–{dentist.workEnd}
                  </p>
                </div>
                <Badge variant={dentist.active ? "secondary" : "outline"} className="shrink-0">{dentist.active ? "Atendendo" : "Inativo"}</Badge>
              </div>

              <div className="space-y-1.5">
                <p className="sr-only">Dias de atendimento: {describeWorkDays(dentist.workDays)}</p>
                <div aria-hidden className="grid grid-cols-7 gap-1">
                  {WEEKDAY_LABELS.map((label, day) => (
                    <span
                      key={label}
                      className={cn(
                        "rounded-md py-1 text-center text-xs",
                        dentist.workDays.includes(day) ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground/50",
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {canManage && (
                <div className="-mb-1 flex justify-end border-t pt-3">
                  <ActionDialog
                    triggerLabel="Editar"
                    triggerVariant="ghost"
                    triggerSize="sm"
                    title="Editar dentista"
                    submitLabel="Salvar"
                    action={updateDentistAction.bind(null, dentist.id)}
                  >
                    <DentistFields dentist={dentist} />
                  </ActionDialog>
                </div>
              )}
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}
