import { Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CenteredCard } from "@/components/auth/centered-card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSession } from "@/lib/session";
import { ClinicForm } from "./clinic-form";

export const metadata = { title: "Sua clínica" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default function OnboardingPage() {
  return (
    <CenteredCard icon={Building2} eyebrow="Último passo" title="Cadastre a sua clínica">
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <OnboardingContent />
      </Suspense>
    </CenteredCard>
  );
}

async function OnboardingContent() {
  const session = await requireSession();
  if (session.session.activeOrganizationId) redirect("/agenda");

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground text-pretty">
        Olá, {session.user.name}. Você será o administrador e poderá convidar a secretária e os dentistas.
      </p>
      <ClinicForm />
    </div>
  );
}
