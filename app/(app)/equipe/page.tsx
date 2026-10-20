import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/form/confirm-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-3xl tracking-tight">Equipe</h1>
          <p className="text-sm text-muted-foreground">Quem tem acesso ao sistema da clínica e com qual perfil.</p>
        </div>
        <InviteDialog action={inviteMemberAction} />
      </header>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isAdmin = member.role.split(",").includes("admin");
              return (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={isAdmin ? "default" : "secondary"}>{roleLabel(member.role)}</Badge>
                  </TableCell>
                  <TableCell>
                    {canRemove && !isAdmin && (
                      <ConfirmButton
                        label="Remover"
                        variant="ghost"
                        confirmMessage={`Remover ${member.name} da clínica?`}
                        action={removeMemberAction.bind(null, member.id)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {invitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading text-xl tracking-tight">Convites pendentes</h2>
          <ul className="space-y-2">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{invitation.email}</p>
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
