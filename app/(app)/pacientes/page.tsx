import { Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ActionDialog } from "@/components/form/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/authz";
import { formatBrPhone } from "@/lib/phone";
import { listPatients } from "@/lib/services/patients";
import { getServiceContext } from "@/lib/services/server";
import { createPatientAction, updatePatientAction } from "./actions";
import { PatientFields } from "./patient-fields";

export const metadata = { title: "Pacientes" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default async function PacientesPage({ searchParams }: PageProps<"/pacientes">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const ctx = await getServiceContext();
  const { items, total } = await listPatients(ctx, { search });
  const canCreate = can(ctx.role, "patient", "create");
  const canUpdate = can(ctx.role, "patient", "update");

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "paciente" : "pacientes"}
            {search ? ` para “${search}”` : ""}
          </p>
        </div>
        {canCreate && (
          <ActionDialog
            triggerLabel="Novo paciente"
            title="Novo paciente"
            description="O CPF é opcional, mas não pode repetir dentro da clínica."
            submitLabel="Cadastrar"
            action={createPatientAction}
          >
            <PatientFields />
          </ActionDialog>
        )}
      </header>

      <form method="get" role="search" className="flex gap-2">
        <Input name="q" defaultValue={search} placeholder="Buscar por nome, telefone ou CPF" aria-label="Buscar paciente" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState icon={Users} title={search ? "Ninguém encontrado" : "Nenhum paciente ainda"}>
{search ? "Confira a grafia ou busque pelo telefone." : "Cadastre o primeiro paciente para começar a agendar."}
</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell className="font-medium">{patient.name}</TableCell>
                  <TableCell className="tabular-nums">{formatBrPhone(patient.phoneE164)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{patient.cpfMasked ?? "—"}</TableCell>
                  <TableCell>
                    {patient.status === "PENDING" ? <Badge variant="outline">Aguardando confirmação</Badge> : null}
                    {patient.doNotContact ? <Badge variant="secondary">Não contatar</Badge> : null}
                  </TableCell>
                  <TableCell>
                    {canUpdate && (
                      <ActionDialog
                        triggerLabel="Editar"
                        triggerVariant="ghost"
                        triggerSize="sm"
                        title="Editar paciente"
                        submitLabel="Salvar"
                        action={updatePatientAction.bind(null, patient.id)}
                      >
                        <PatientFields patient={patient} />
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
