import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/authz";
import { getAiQuality, parsePeriod, percent, QUALITY_PERIODS } from "@/lib/services/ai-quality";
import { getServiceContext } from "@/lib/services/server";
import { Breakdown } from "./breakdown";
import { STEP_LABEL, guidance } from "./labels";

export const metadata = { title: "Qualidade da IA" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-4xl tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

const asPercent = (value: number | null): string => (value === null ? "—" : `${value}%`);

export default async function QualidadeIaPage({ searchParams }: PageProps<"/qualidade-ia">) {
  const params = await searchParams;
  const ctx = await getServiceContext();
  if (!can(ctx.role, "triggerRule", "read")) {
    return (
      <EmptyState icon={ShieldAlert} title="Só o administrador da clínica vê isto">
        Peça ao administrador para acompanhar a qualidade do assistente de IA.
      </EmptyState>
    );
  }
  const days = parsePeriod(typeof params.dias === "string" ? params.dias : undefined);
  const quality = await getAiQuality(ctx, days);
  const { conversations, freeText, reading, writing, aside } = quality;
  const advice = guidance(quality);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Qualidade da IA"
        description="Como o assistente está se saindo no WhatsApp. Só contagens: nenhuma mensagem ou nome de paciente aparece aqui."
        actions={
          <nav aria-label="Período" className="flex gap-1">
            {QUALITY_PERIODS.map((period) => (
              <Link
                key={period}
                href={`/qualidade-ia?dias=${period}`}
                aria-current={period === days ? "page" : undefined}
                className={buttonVariants({ variant: period === days ? "default" : "outline", size: "sm" })}
              >
                {period} dias
              </Link>
            ))}
          </nav>
        }
      />

      {advice.length > 0 ? (
        <ul className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {advice.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pedidos de consulta pelo WhatsApp" value={String(conversations.done)} note={`${asPercent(percent(conversations.done, conversations.started))} das ${conversations.started} conversas`} />
        <Stat label="Passaram para a secretária" value={String(conversations.handedOff)} note={`${asPercent(percent(conversations.handedOff, conversations.started))} das conversas`} />
        <Stat
          label="Perguntas escritas pela IA e aprovadas"
          value={asPercent(percent(writing.used, writing.used + writing.rejected + writing.failed))}
          note={`${writing.used} de ${writing.used + writing.rejected + writing.failed} · o resto usou o texto fixo`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="Conversas de agendamento"
          description="O que aconteceu com cada conversa iniciada no período."
          empty="Nenhuma conversa de agendamento no período."
          rows={[
            { label: "Viraram pedido de consulta", value: conversations.done, tone: "good" },
            { label: "Passaram para a secretária", value: conversations.handedOff, tone: "attention" },
            { label: "Ficaram sem resposta (expiraram)", value: conversations.expired, tone: "neutral" },
            { label: "Em andamento", value: conversations.open, tone: "neutral" },
          ]}
        />
        <Breakdown
          title="Onde as conversas travam"
          description="Etapa em que a conversa passou para a secretária. Muitas num mesmo ponto indicam uma pergunta que confunde."
          empty="Nenhuma conversa passou para a secretária no período."
          rows={(Object.keys(STEP_LABEL) as Array<keyof typeof STEP_LABEL>).map((step) => ({ label: STEP_LABEL[step], value: conversations.handedOffByStep[step], tone: "attention" as const }))}
        />
        <Breakdown
          title="Leitura das respostas"
          description="Quando a pessoa escreve com as próprias palavras, a IA tenta entender. Se não tem certeza, o diálogo pede de novo."
          empty="A IA ainda não leu nenhuma resposta no período."
          rows={[
            { label: "Entendeu com segurança", value: reading.read, tone: "good" },
            { label: "Não teve certeza", value: reading.unsure, tone: "neutral" },
            { label: "Falhou (erro do provedor)", value: reading.failed, tone: "attention" },
          ]}
        />
        <Breakdown
          title="Perguntas escritas pela IA"
          description="Toda frase da IA passa por uma conferência (horários exatos, sem números inventados, sem links). Se reprova, vai o texto fixo."
          empty="A IA ainda não escreveu nenhuma pergunta no período."
          rows={[
            { label: "Enviadas como a IA escreveu", value: writing.used, tone: "good" },
            { label: "Reprovadas na conferência (texto fixo)", value: writing.rejected, tone: "attention" },
            { label: "Falhou (texto fixo)", value: writing.failed, tone: "attention" },
          ]}
        />
        <Breakdown
          title="Mensagens livres de pacientes"
          description="Mensagens de quem já é paciente que nenhuma palavra-chave (1, 2, SAIR) explica."
          empty="Nenhuma mensagem livre no período."
          rows={[
            { label: "Respondidas pela IA", value: freeText.answeredByAi, tone: "good" },
            { label: "A IA não teve certeza: foram para a secretária", value: freeText.aiUnsure, tone: "neutral" },
            { label: "Urgentes: foram direto para a secretária", value: freeText.urgent, tone: "neutral" },
            { label: "IA indisponível: foram para a secretária", value: freeText.aiUnavailable, tone: "attention" },
            { label: "Sem IA ligada: foram para a secretária", value: freeText.sentToSecretary, tone: "neutral" },
          ]}
        />
        <Breakdown
          title="Perguntas laterais"
          description="Quando alguém pergunta algo no meio do agendamento (endereço, pagamento), a IA responde só com o que a clínica cadastrou."
          empty="Ninguém fez perguntas laterais no período."
          rows={[
            { label: "Respondidas com as informações da clínica", value: aside.answered, tone: "good" },
            { label: "Resposta reprovada na conferência", value: aside.rejected, tone: "attention" },
          ]}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Chamadas à IA no período: <span className="tabular-nums text-foreground">{quality.aiCalls}</span>. É o que gera custo na sua conta da OpenRouter.
      </p>
    </section>
  );
}
