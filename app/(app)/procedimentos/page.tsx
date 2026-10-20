import { Stethoscope, Timer } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ActionDialog } from "@/components/form/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { listProcedures } from "@/lib/services/procedures";
import { getServiceContext } from "@/lib/services/server";
import { cn } from "@/lib/utils";
import { createProcedureAction, updateProcedureAction } from "./actions";
import { ProcedureFields } from "./procedure-fields";

export const metadata = { title: "Procedimentos" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default async function ProcedimentosPage() {
  const ctx = await getServiceContext();
  const procedures = await listProcedures(ctx, { includeInactive: true });
  const canManage = can(ctx.role, "procedure", "update");

  return (
    <section className="space-y-6">
      <PageHeader
        title="Procedimentos"
        description="O que a clínica oferece e quanto tempo cada um leva."
        actions={
          can(ctx.role, "procedure", "create") ? (
            <ActionDialog triggerLabel="Novo procedimento" title="Novo procedimento" submitLabel="Cadastrar" action={createProcedureAction}>
              <ProcedureFields />
            </ActionDialog>
          ) : null
        }
      />

      {procedures.length === 0 ? (
        <EmptyState icon={Stethoscope} title="Nenhum procedimento cadastrado">
          Cadastre ao menos um (por exemplo, “Avaliação”) para poder agendar consultas.
        </EmptyState>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {procedures.map((procedure) => (
            <StaggerItem
              key={procedure.id}
              className={cn(
                "flex flex-col gap-4 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-sm",
                !procedure.active && "bg-card/60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className={cn("min-w-0 flex-1 font-medium text-balance", !procedure.active && "text-muted-foreground")}>
                  {procedure.name}
                </p>
                <Badge variant={procedure.active ? "secondary" : "outline"}>{procedure.active ? "Disponível" : "Inativo"}</Badge>
              </div>
              <p className="flex items-baseline gap-1.5 tabular-nums">
                <Timer className="size-4 self-center text-muted-foreground" aria-hidden />
                <span className="font-heading text-3xl leading-none">{procedure.defaultDurationMin}</span>
                <span className="text-sm text-muted-foreground">min</span>
              </p>
              {canManage && (
                <div className="-mb-1 mt-auto flex justify-end border-t pt-3">
                  <ActionDialog
                    triggerLabel="Editar"
                    triggerVariant="ghost"
                    triggerSize="sm"
                    title="Editar procedimento"
                    submitLabel="Salvar"
                    action={updateProcedureAction.bind(null, procedure.id)}
                  >
                    <ProcedureFields procedure={procedure} />
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
