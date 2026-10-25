import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { getSettings } from "@/lib/services/settings";
import { getServiceContext } from "@/lib/services/server";
import { updateSettingsAction } from "./actions";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Mensagens" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default async function MensagensPage() {
  const ctx = await getServiceContext();
  if (!can(ctx.role, "triggerRule", "read")) {
    return (
      <EmptyState icon={ShieldAlert} title="Só o administrador da clínica altera isto">
        Peça ao administrador para ajustar os horários das mensagens.
      </EmptyState>
    );
  }
  const settings = await getSettings(ctx);

  return (
    <section className="space-y-6">
      <PageHeader title="Mensagens" description="Quando o sistema avisa os pacientes. Cada clínica define os seus horários." />
      <SettingsForm settings={settings} action={updateSettingsAction} />
    </section>
  );
}
