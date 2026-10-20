import { UserRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ActionDialog } from "@/components/form/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/authz";
import { describeWorkDays } from "@/lib/labels";
import { listDentists } from "@/lib/services/dentists";
import { getServiceContext } from "@/lib/services/server";
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl tracking-tight">Dentistas</h1>
          <p className="text-sm text-muted-foreground">Cada dentista tem a própria agenda e horário de atendimento.</p>
        </div>
        {can(ctx.role, "dentist", "create") && (
          <ActionDialog triggerLabel="Novo dentista" title="Novo dentista" submitLabel="Cadastrar" action={createDentistAction}>
            <DentistFields />
          </ActionDialog>
        )}
      </header>

      {dentists.length === 0 ? (
        <EmptyState icon={UserRound} title="Nenhum dentista cadastrado">
Cadastre os dentistas da clínica para liberar a agenda.
</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Horário</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dentists.map((dentist) => (
                <TableRow key={dentist.id}>
                  <TableCell className="font-medium">{dentist.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {dentist.workStart}–{dentist.workEnd}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{describeWorkDays(dentist.workDays)}</TableCell>
                  <TableCell>{dentist.active ? <Badge variant="secondary">Atendendo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                  <TableCell>
                    {canManage && (
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
