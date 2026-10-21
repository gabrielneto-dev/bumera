import { Search, Users } from "lucide-react";
import { AvatarInitials } from "@/components/avatar-initials";
import { EmptyState } from "@/components/empty-state";
import { ActionDialog } from "@/components/form/action-dialog";
import { CheckboxField } from "@/components/form/form-state";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/authz";
import { formatBrPhone } from "@/lib/phone";
import { listPatients } from "@/lib/services/patients";
import { getServiceContext } from "@/lib/services/server";
import { allowMessagesAgainAction, createPatientAction, updatePatientAction } from "./actions";
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
      <PageHeader
        title="Pacientes"
        description={
          <>
            {total} {total === 1 ? "paciente" : "pacientes"}
            {search ? ` para “${search}”` : ""}
          </>
        }
        actions={
          canCreate ? (
            <ActionDialog
              triggerLabel="Novo paciente"
              title="Novo paciente"
              description="O CPF é opcional, mas não pode repetir dentro da clínica."
              submitLabel="Cadastrar"
              action={createPatientAction}
            >
              <PatientFields />
            </ActionDialog>
          ) : null
        }
      />

      <form method="get" role="search" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Nome, telefone ou CPF"
            aria-label="Buscar paciente"
            className="h-10 bg-card pl-9"
          />
        </div>
        <Button type="submit" variant="outline" size="lg">
          Buscar
        </Button>
      </form>

      {items.length === 0 ? (
        <EmptyState icon={Users} title={search ? "Ninguém encontrado" : "Nenhum paciente ainda"}>
          {search ? "Confira a grafia ou busque pelo telefone." : "Cadastre o primeiro paciente para começar a agendar."}
        </EmptyState>
      ) : (
        <Stagger className="divide-y overflow-hidden rounded-2xl border bg-card">
          {items.map((patient) => (
            <StaggerItem key={patient.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40">
              <AvatarInitials name={patient.name} />
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-medium break-words">{patient.name}</p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatBrPhone(patient.phoneE164)}
                  {patient.cpfMasked ? ` · CPF ${patient.cpfMasked}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {patient.status === "PENDING" ? <Badge variant="outline">Aguardando confirmação</Badge> : null}
                {patient.doNotContact ? <Badge variant="secondary">Não contatar</Badge> : null}
                {canUpdate && patient.doNotContact && (
                  <ActionDialog
                    triggerLabel="Permitir mensagens"
                    triggerVariant="outline"
                    triggerSize="sm"
                    title="Permitir mensagens novamente"
                    submitLabel="Permitir"
                    action={allowMessagesAgainAction.bind(null, patient.id)}
                  >
                    <p className="text-sm text-muted-foreground">
                      {patient.name} pediu para parar de receber mensagens. Só libere se o paciente aceitou voltar a
                      receber lembretes por WhatsApp.
                    </p>
                    <CheckboxField name="consent" label="O paciente aceitou voltar a receber mensagens por WhatsApp" />
                  </ActionDialog>
                )}
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
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}
