import { headers } from "next/headers";
import { MailOpen, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CenteredCard } from "@/components/auth/centered-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { acceptInvitationAction } from "./actions";
import { AcceptButton } from "./accept-button";

export const metadata = { title: "Convite" };
// Per-user page: it depends on the session cookie, so navigating here may block.
export const instant = false;

const ROLE_LABEL: Record<string, string> = { secretary: "secretária", dentist: "dentista", admin: "administrador" };

export default function InvitePage({ params }: PageProps<"/convite/[id]">) {
  return (
    <CenteredCard icon={MailOpen} eyebrow="Convite" title="Convite para a clínica">
      <Suspense fallback={<Skeleton className="h-32 w-full" />}>
        <InviteContent params={params} />
      </Suspense>
    </CenteredCard>
  );
}

async function InviteContent({ params }: { params: PageProps<"/convite/[id]">["params"] }) {
  const { id } = await params;
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    const next = encodeURIComponent(`/convite/${id}`);
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground text-pretty">
          Para aceitar, entre ou crie a sua conta usando <strong className="text-foreground">o mesmo e-mail em que o convite foi feito</strong>.
        </p>
        <div className="flex flex-col gap-2">
          <Link href={`/sign-up?next=${next}`} className={buttonVariants({ size: "lg", className: "h-10 w-full text-sm" })}>
            Criar conta
          </Link>
          <Link href={`/sign-in?next=${next}`} className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 w-full text-sm" })}>
            Já tenho conta
          </Link>
        </div>
      </div>
    );
  }

  const invitation = await auth.api.getInvitation({ query: { id }, headers: requestHeaders }).catch(() => null);
  if (!invitation || invitation.status !== "pending") {
    return (
      <div className="space-y-3 rounded-xl bg-warning/10 px-4 py-4 text-sm text-pretty">
        <p className="flex items-center gap-2 font-medium">
          <TriangleAlert className="size-4 text-warning" aria-hidden />
          Este convite não está disponível
        </p>
        <p className="text-muted-foreground">
          Ele pode ter expirado, ter sido cancelado, já ter sido usado ou ter sido feito para outro e-mail. Peça um novo
          convite ao administrador da clínica (você está entrando como {session.user.email}).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <dl className="divide-y rounded-xl border bg-background text-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Clínica</dt>
          <dd className="font-medium">{invitation.organizationName}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Seu papel</dt>
          <dd className="font-medium capitalize">{ROLE_LABEL[invitation.role] ?? invitation.role}</dd>
        </div>
      </dl>
      <AcceptButton action={acceptInvitationAction.bind(null, id)} />
    </div>
  );
}
