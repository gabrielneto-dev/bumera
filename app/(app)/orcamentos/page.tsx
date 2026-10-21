import { Receipt } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmptyState } from "@/components/empty-state";
import { ActionDialog } from "@/components/form/action-dialog";
import { ConfirmButton } from "@/components/form/confirm-button";
import { SelectField, TextField } from "@/components/form/form-state";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/authz";
import { formatBrPhone } from "@/lib/phone";
import { listPatients } from "@/lib/services/patients";
import { listQuotes, type QuoteDto } from "@/lib/services/quotes";
import { getServiceContext } from "@/lib/services/server";
import { closeQuoteAction, createQuoteAction } from "./actions";

export const metadata = { title: "Orçamentos" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

const STATUS_LABEL: Record<QuoteDto["effectiveStatus"], string> = {
  OPEN: "Em aberto",
  EXPIRED: "Expirado",
  ACCEPTED: "Fechado",
  DECLINED: "Perdido",
};
const STATUS_VARIANT: Record<QuoteDto["effectiveStatus"], "default" | "secondary" | "outline"> = {
  OPEN: "default",
  EXPIRED: "outline",
  ACCEPTED: "secondary",
  DECLINED: "outline",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

export default async function OrcamentosPage() {
  const ctx = await getServiceContext();
  const canCreate = can(ctx.role, "quote", "create");
  const [quotes, patients] = await Promise.all([
    listQuotes(ctx),
    canCreate ? listPatients(ctx, { status: "CONFIRMED" }) : Promise.resolve({ items: [] }),
  ]);
  const patientOptions = patients.items.map((patient) => ({ value: patient.id, label: `${patient.name} · ${formatBrPhone(patient.phoneE164)}` }));

  return (
    <section className="space-y-6">
      <AutoRefresh />
      <PageHeader
        title="Orçamentos"
        description="Registre o orçamento dado ao paciente: o sistema pergunta se ficou alguma dúvida depois de 2 e de 7 dias."
        actions={
          canCreate ? (
            <ActionDialog triggerLabel="Novo orçamento" title="Novo orçamento" submitLabel="Registrar" action={createQuoteAction}>
              <SelectField name="patientId" label="Paciente" options={patientOptions} placeholder="Escolha o paciente" required />
              <TextField name="description" label="O que foi orçado" placeholder="Implante, clareamento, aparelho…" required autoComplete="off" maxLength={200} />
              <TextField
                name="value"
                label="Valor em reais (opcional)"
                type="number"
                min={0}
                max={99999.99}
                step={0.01}
                inputMode="decimal"
                hint="Aparece só aqui para a equipe; não é enviado ao paciente."
              />
            </ActionDialog>
          ) : null
        }
      />

      {quotes.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhum orçamento ainda">
          Quando você registrar um orçamento, o paciente recebe um lembrete amigável e pode responder pelo WhatsApp.
        </EmptyState>
      ) : (
        <Stagger className="divide-y overflow-hidden rounded-2xl border bg-card">
          {quotes.map((quote) => (
            <StaggerItem key={quote.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-medium break-words">{quote.patient.name}</p>
                <p className="text-sm text-muted-foreground break-words">
                  {quote.description}
                  {quote.valueCents === null ? "" : ` · ${brl.format(quote.valueCents / 100)}`}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {formatBrPhone(quote.patient.phoneE164)} · registrado em {dayMonth.format(new Date(quote.createdAt))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[quote.effectiveStatus]}>{STATUS_LABEL[quote.effectiveStatus]}</Badge>
                {canCreate && quote.status === "OPEN" && (
                  <>
                    <ConfirmButton label="Perdido" variant="ghost" confirmMessage="Marcar este orçamento como perdido? Os lembretes param." action={closeQuoteAction.bind(null, quote.id, "DECLINED")} />
                    <ConfirmButton label="Fechado" action={closeQuoteAction.bind(null, quote.id, "ACCEPTED")} />
                  </>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}
