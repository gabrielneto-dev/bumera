import { type ReactNode, Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { can } from "@/lib/authz";
import { getSignedInContext } from "@/lib/services/server";
import { AppNav, type NavItem } from "./nav";
import { SignOutButton } from "./sign-out-button";

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
    { href: "/agenda", label: "Agenda", allowed: can(role, "appointment", "read") },
    { href: "/pacientes", label: "Pacientes", allowed: can(role, "patient", "read") },
    { href: "/pendentes", label: "Pendentes", allowed: can(role, "patient", "update") },
    { href: "/dentistas", label: "Dentistas", allowed: can(role, "dentist", "create") },
    { href: "/procedimentos", label: "Procedimentos", allowed: can(role, "procedure", "create") },
  ];
  return candidates.filter((item) => item.allowed).map(({ href, label }) => ({ href, label }));
}

async function SignedInShell({ children }: { children: ReactNode }) {
  const { ctx, userName, clinicName } = await getSignedInContext();

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-2 sm:px-6">
          <div className="flex items-baseline gap-3 pb-2">
            <span className="font-heading text-lg tracking-tight">Bumera</span>
            <span className="text-sm text-muted-foreground">{clinicName}</span>
          </div>
          <div className="flex items-center gap-3 pb-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <AppNav items={navItemsFor(ctx.role)} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
