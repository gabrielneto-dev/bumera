import { type ReactNode, Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { prisma } from "@/lib/prisma";
import { requireClinicSession } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export default function AppLayout({ children }: { children: ReactNode }) {
  // The session is request-time data, so the whole signed-in area streams behind one boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

async function SignedInShell({ children }: { children: ReactNode }) {
  const { user, organizationId } = await requireClinicSession();
  const clinic = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span className="font-heading text-lg tracking-tight">Bumera</span>
            <span className="text-sm text-muted-foreground">{clinic?.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
