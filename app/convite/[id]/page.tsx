import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { acceptInvitationAction } from "./actions";
import { AcceptButton } from "./accept-button";

export const metadata = { title: "Convite" };
// Per-user page: it depends on the session cookie, so navigating here may block.
export const instant = false;

const ROLE_LABEL: Record<string, string> = { secretary: "secretária", dentist: "dentista", admin: "administrador" };

export default function InvitePage({ params }: PageProps<"/convite/[id]">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <h1 className="font-heading text-3xl tracking-tight">Convite para a clínica</h1>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
          <InviteContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function InviteContent({ params }: { params: PageProps<"/convite/[id]">["params"] }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    const next = encodeURIComponent(`/convite/${id}`);
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Para aceitar, entre ou crie a sua conta usando <strong>o mesmo e-mail em que o convite foi feito</strong>.
        </p>
        <div className="flex gap-2">
          <Link href={`/sign-up?next=${next}`} className={buttonVariants()}>
            Criar conta
          </Link>
          <Link href={`/sign-in?next=${next}`} className={buttonVariants({ variant: "outline" })}>
            Já tenho conta
          </Link>
        </div>
      </div>
    );
  }

  const invitation = await auth.api.getInvitation({ query: { id }, headers: requestHeaders }).catch(() => null);
  if (!invitation || invitation.status !== "pending") {
    return (
      <p className="rounded-xl border border-dashed bg-card px-5 py-6 text-sm text-muted-foreground">
        Este convite não está disponível: ele pode ter expirado, ter sido cancelado, já ter sido usado ou ter sido feito
        para outro e-mail. Peça um novo convite ao administrador da clínica (você está entrando como {session.user.email}).
      </p>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border bg-card p-6">
      <p className="text-sm text-muted-foreground">
        Você foi convidado para a clínica <strong className="text-foreground">{invitation.organizationName}</strong> como{" "}
        <strong className="text-foreground">{ROLE_LABEL[invitation.role] ?? invitation.role}</strong>.
      </p>
      <AcceptButton action={acceptInvitationAction.bind(null, id)} />
    </div>
  );
}
