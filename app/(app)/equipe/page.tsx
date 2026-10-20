import { MailOpen } from "lucide-react";
import { AvatarInitials } from "@/components/avatar-initials";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/form/confirm-button";
import { can } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { listTeam } from "@/lib/services/team";
import { getServiceContext, requirePageAccess } from "@/lib/services/server";
import { cancelInvitationAction, inviteMemberAction, removeMemberAction } from "./actions";
import { InviteDialog } from "./invite-dialog";

export const metadata = { title: "Equipe" };
// Per-user page: it depends on the session cookie, so navigating here may block (loading.tsx covers the wait).
export const instant = false;

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", secretary: "Secretária", dentist: "Dentista" };

const roleLabel = (role: string) =>
  role
    .split(",")
    .map((part) => ROLE_LABEL[part.trim()] ?? part.trim())
    .join(", ");

export default async function EquipePage() {
  const ctx = await getServiceContext();
  requirePageAccess(ctx, "invitation", "create");
  const { members, invitations } = await listTeam(prisma, ctx);
  const canRemove = can(ctx.role, "member", "delete");
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

  return (
    <section className="space-y-8">
      <PageHeader
        title="Equipe"
        description="Quem tem acesso ao sistema da clínica e com qual perfil."
        actions={<InviteDialog action={inviteMemberAction} />}
      />

      <Stagger className="divide-y overflow-hidden rounded-2xl border bg-card">
        {members.map((member) => {
          const isAdmin = member.role.split(",").includes("admin");
          return (
            <StaggerItem key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <AvatarInitials name={member.name} />
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium">{member.name}</p>
                <p className="text-sm text-muted-foreground break-all">{member.email}</p>
              </div>
              <Badge variant={isAdmin ? "default" : "secondary"}>{roleLabel(member.role)}</Badge>
              {canRemove && !isAdmin && (
                <ConfirmButton
                  label="Remover"
                  variant="ghost"
                  confirmMessage={`Remover ${member.name} da clínica?`}
                  action={removeMemberAction.bind(null, member.id)}
                />
              )}
            </StaggerItem>
          );
        })}
      </Stagger>

      {invitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            <MailOpen className="size-4" aria-hidden />
            Convites pendentes
          </h2>
          <ul className="space-y-2">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed bg-card/60 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-all">{invitation.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {roleLabel(invitation.role)} · vale até {dateFormat.format(new Date(invitation.expiresAt))}
                  </p>
                </div>
                <ConfirmButton
                  label="Cancelar convite"
                  variant="ghost"
                  confirmMessage="Cancelar este convite?"
                  action={cancelInvitationAction.bind(null, invitation.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
