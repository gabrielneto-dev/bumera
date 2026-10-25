import { ScrollText, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { AUDIT_ACTION_LABEL } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { listAuditLog } from "@/lib/services/audit";
import { getServiceContext } from "@/lib/services/server";

export const metadata = { title: "Atividades" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Human text for the small details kept with an entry (field names, statuses), never personal values. */
function describe(details: unknown): string {
  if (typeof details !== "object" || details === null) return "";
  const record = details as Record<string, unknown>;
  if (Array.isArray(record.fields)) return `campos: ${record.fields.join(", ")}`;
  if ("from" in record && "to" in record) return `${String(record.from)} → ${String(record.to)}`;
  if ("answer" in record) return `resposta: ${String(record.answer)}`;
  if ("status" in record) return `situação: ${String(record.status)}`;
  if ("connected" in record) return record.connected ? "conectado" : "desconectado";
  return "";
}

export default async function AtividadesPage() {
  const ctx = await getServiceContext();
  if (!can(ctx.role, "audit", "read")) {
    return (
      <EmptyState icon={ShieldAlert} title="Só o administrador da clínica vê isto">
        O registro de atividades mostra quem mexeu nos dados dos pacientes.
      </EmptyState>
    );
  }
  const entries = await listAuditLog(ctx);
  const userIds = [...new Set(entries.flatMap((entry) => (entry.actorUserId ? [entry.actorUserId] : [])))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return (
    <section className="space-y-6">
      <PageHeader
        title="Atividades"
        description="Quem fez o quê com os dados dos pacientes: cadastros, alterações, exportações e exclusões. O registro não pode ser editado."
      />
      {entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nada registrado ainda">
          Cada cadastro, alteração ou exportação de dados de pacientes aparece aqui.
        </EmptyState>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="w-28 shrink-0 text-muted-foreground tabular-nums">{dateTime.format(new Date(entry.createdAt))}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{AUDIT_ACTION_LABEL[entry.action]}</span>
                {entry.patientName ? <span className="text-muted-foreground"> · {entry.patientName}</span> : null}
                {describe(entry.details) ? <span className="text-muted-foreground"> · {describe(entry.details)}</span> : null}
              </span>
              <span className="text-muted-foreground">
                {entry.actorType === "SYSTEM" ? "Sistema (resposta do paciente)" : (names.get(entry.actorUserId ?? "") ?? "Usuário removido")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
