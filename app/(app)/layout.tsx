import { cookies } from "next/headers";
import { type ReactNode, Suspense } from "react";
import { PageTransition } from "@/components/motion";
import { PageSkeleton } from "@/components/page-skeleton";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { can } from "@/lib/authz";
import { getSignedInContext } from "@/lib/services/server";
import { EmailVerificationBanner } from "./email-verification";
import { AppSidebar, type NavItem } from "./app-sidebar";
import { requestVerificationCodeAction, verifyEmailCodeAction } from "./verification-actions";

export default function AppLayout({ children }: { children: ReactNode }) {
  // The session is request-time data, so the whole signed-in area streams behind one boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

function navItemsFor(role: string): NavItem[] {
  const candidates: Array<NavItem & { allowed: boolean }> = [
    { href: "/agenda", label: "Agenda", icon: "agenda", group: "Rotina", allowed: can(role, "appointment", "read") },
    { href: "/pendentes", label: "Pendentes", icon: "pendentes", group: "Rotina", allowed: can(role, "patient", "update") },
    { href: "/orcamentos", label: "Orçamentos", icon: "orcamentos", group: "Rotina", allowed: can(role, "quote", "read") },
    { href: "/pacientes", label: "Pacientes", icon: "pacientes", group: "Cadastros", allowed: can(role, "patient", "read") },
    { href: "/dentistas", label: "Dentistas", icon: "dentistas", group: "Cadastros", allowed: can(role, "dentist", "create") },
    { href: "/procedimentos", label: "Procedimentos", icon: "procedimentos", group: "Cadastros", allowed: can(role, "procedure", "create") },
    { href: "/mensagens", label: "Mensagens", icon: "mensagens", group: "Clínica", allowed: can(role, "triggerRule", "update") },
    { href: "/whatsapp", label: "WhatsApp", icon: "whatsapp", group: "Clínica", allowed: can(role, "triggerRule", "update") },
    { href: "/atividades", label: "Atividades", icon: "atividades", group: "Clínica", allowed: can(role, "audit", "read") },
    { href: "/assistente", label: "Assistente", icon: "assistente", group: "Clínica", allowed: can(role, "triggerRule", "update") },
    { href: "/equipe", label: "Equipe", icon: "equipe", group: "Clínica", allowed: can(role, "invitation", "create") },
  ];
  return candidates.filter((item) => item.allowed).map(({ href, label, icon, group }) => ({ href, label, icon, group }));
}

async function SignedInShell({ children }: { children: ReactNode }) {
  const { ctx, userName, userEmail, emailVerified, clinicName } = await getSignedInContext();
  const sidebarCookie = (await cookies()).get("sidebar_state")?.value;

  return (
    <SidebarProvider defaultOpen={sidebarCookie !== "false"}>
      <AppSidebar items={navItemsFor(ctx.role)} clinicName={clinicName} userName={userName} userEmail={userEmail} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger aria-label="Alternar menu lateral" />
        </header>
        {!emailVerified && (
          <EmailVerificationBanner
            email={userEmail}
            requestCode={requestVerificationCodeAction}
            verify={verifyEmailCodeAction}
          />
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
