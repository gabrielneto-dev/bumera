import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { getAssistantSettings } from "@/lib/services/assistant";
import { getServiceContext } from "@/lib/services/server";
import { saveAssistantAction } from "./actions";
import { AssistantForm } from "./assistant-form";

export const metadata = { title: "Assistente" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default async function AssistentePage() {
  const ctx = await getServiceContext();
  if (!can(ctx.role, "triggerRule", "read")) {
    return (
      <EmptyState icon={ShieldAlert} title="Só o administrador da clínica altera isto">
        Peça ao administrador para configurar o assistente de IA.
      </EmptyState>
    );
  }
  const settings = await getAssistantSettings(ctx);

  return (
    <section className="space-y-6">
      <PageHeader title="Assistente" description="Ajuda a responder mensagens dos pacientes no WhatsApp. Opcional e desligado por padrão." />
      <AssistantForm settings={settings} action={saveAssistantAction} />
    </section>
  );
}
