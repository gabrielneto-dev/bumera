import type { PrismaClient } from "@/generated/prisma/client";
import { assertCan } from "@/lib/authz";
import type { ServiceContext } from "@/lib/services/context";

export interface TeamMemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
}

export interface PendingInvitationDto {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

/**
 * Members and pending invitations of the caller's clinic. Member/Invitation belong to Better
 * Auth, so they are read with the plain client and an explicit clinic filter.
 */
export async function listTeam(
  prisma: PrismaClient,
  ctx: ServiceContext,
): Promise<{ members: TeamMemberDto[]; invitations: PendingInvitationDto[] }> {
  assertCan(ctx.role, "invitation", "create");
  const [members, invitations] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.invitation.findMany({
      where: { organizationId: ctx.organizationId, status: "pending", expiresAt: { gt: ctx.now() } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  return {
    members: members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role ?? "member",
      expiresAt: invitation.expiresAt.toISOString(),
    })),
  };
}
