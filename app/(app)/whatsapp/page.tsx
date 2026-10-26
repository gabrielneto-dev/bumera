import { MessageCircleOff, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { getServiceContext } from "@/lib/services/server";
import { getWhatsappSettings } from "@/lib/services/whatsapp";
import { saveWhatsappAction } from "./actions";
import { WhatsappForm } from "./whatsapp-form";

export const metadata = { title: "WhatsApp" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default async function WhatsappPage() {
  const ctx = await getServiceContext();
  if (!can(ctx.role, "triggerRule", "read")) {
    return (
      <EmptyState icon={ShieldAlert} title="Só o administrador da clínica altera isto">
        Peça ao administrador para conectar o WhatsApp da clínica.
      </EmptyState>
    );
  }
  const { instance, clinicInfo } = await getWhatsappSettings(ctx);

  return (
    <section className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="O número de WhatsApp da clínica e o que o atendimento automático pode responder. As conversas acontecem nos fluxos do n8n."
      />
      {instance === null && (
        <EmptyState icon={MessageCircleOff} title="WhatsApp ainda não conectado">
          Enquanto não houver uma instância, nenhuma mensagem sai: os lembretes ficam esperando e são enviados assim que você conectar.
        </EmptyState>
      )}
      <WhatsappForm instance={instance} clinicInfo={clinicInfo} action={saveWhatsappAction} />
    </section>
  );
}
