import { Stethoscope } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ActionDialog } from "@/components/form/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/authz";
import { listProcedures } from "@/lib/services/procedures";
import { getServiceContext } from "@/lib/services/server";
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl tracking-tight">Procedimentos</h1>
          <p className="text-sm text-muted-foreground">O que a clínica oferece e quanto tempo cada um leva.</p>
        </div>
        {can(ctx.role, "procedure", "create") && (
          <ActionDialog triggerLabel="Novo procedimento" title="Novo procedimento" submitLabel="Cadastrar" action={createProcedureAction}>
            <ProcedureFields />
          </ActionDialog>
        )}
      </header>

      {procedures.length === 0 ? (
        <EmptyState icon={Stethoscope} title="Nenhum procedimento cadastrado">
Cadastre ao menos um (por exemplo, “Avaliação”) para poder agendar consultas.
</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {procedures.map((procedure) => (
                <TableRow key={procedure.id}>
                  <TableCell className="font-medium">{procedure.name}</TableCell>
                  <TableCell className="tabular-nums">{procedure.defaultDurationMin} min</TableCell>
                  <TableCell>{procedure.active ? <Badge variant="secondary">Disponível</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                  <TableCell>
                    {canManage && (
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
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
