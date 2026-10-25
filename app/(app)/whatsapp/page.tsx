import { MessageCircleOff, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/authz";
import { type ConnectionState, getConnectionState } from "@/lib/evolution";
import { getServiceContext } from "@/lib/services/server";
import { getWhatsappInstance } from "@/lib/services/whatsapp";
import { saveWhatsappAction } from "./actions";
import { WhatsappForm } from "./whatsapp-form";

export const metadata = { title: "WhatsApp" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

const STATE_LABEL: Record<ConnectionState, { text: string; variant: "default" | "secondary" | "outline" }> = {
  open: { text: "Conectado", variant: "default" },
  connecting: { text: "Conectando — leia o QR code", variant: "secondary" },
  closed: { text: "Desconectado — leia o QR code de novo", variant: "outline" },
  unknown: { text: "Não foi possível verificar agora", variant: "outline" },
  unconfigured: { text: "Verificação indisponível neste servidor", variant: "outline" },
};

export default async function WhatsappPage() {
  const ctx = await getServiceContext();
  if (!can(ctx.role, "triggerRule", "read")) {
    return (
      <EmptyState icon={ShieldAlert} title="Só o administrador da clínica altera isto">
        Peça ao administrador para conectar o WhatsApp da clínica.
      </EmptyState>
    );
  }
  const instance = await getWhatsappInstance(ctx);
  const state = instance ? await getConnectionState(instance) : null;

  return (
    <section className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="O número de WhatsApp pelo qual a clínica fala com os pacientes. Cada clínica tem o seu."
      />
      {instance === null ? (
        <EmptyState icon={MessageCircleOff} title="WhatsApp ainda não conectado">
          Enquanto não houver uma instância, nenhuma mensagem sai: lembretes e respostas ficam esperando e são enviados assim que você conectar.
        </EmptyState>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          Estado da conexão:
          {state && <Badge variant={STATE_LABEL[state].variant}>{STATE_LABEL[state].text}</Badge>}
        </p>
      )}
      <WhatsappForm instance={instance} action={saveWhatsappAction} />
    </section>
  );
}
