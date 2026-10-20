import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { ClinicForm } from "./clinic-form";

export const metadata = { title: "Sua clínica" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <h1 className="font-heading text-3xl tracking-tight">Cadastre a sua clínica</h1>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
          <OnboardingContent />
        </Suspense>
      </div>
    </main>
  );
}

async function OnboardingContent() {
  const session = await requireSession();
  if (session.session.activeOrganizationId) redirect("/agenda");

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Olá, {session.user.name}. Você será o administrador e poderá convidar a secretária e os
        dentistas.
      </p>
      <ClinicForm />
    </div>
  );
}
