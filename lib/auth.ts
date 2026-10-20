import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { getEnv } from "@/lib/env";
import { ac, clinicRoles } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const MIN_PASSWORD_LENGTH = 10;
const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_CLINICS_PER_USER = 1;

const env = getEnv();

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },
  databaseHooks: {
    session: {
      create: {
        // A user belongs to one clinic for now: make it the active one at sign-in.
        before: async (session) => {
          const membership = await prisma.member.findFirst({
            where: { userId: session.userId },
            orderBy: { createdAt: "asc" },
            select: { organizationId: true },
          });
          return { data: { ...session, activeOrganizationId: membership?.organizationId ?? null } };
        },
      },
    },
  },
  plugins: [
    // A clinic is a Better Auth organization (decision CTX-DEC-20261016-saas-multi-tenant).
    organization({
      ac,
      roles: clinicRoles,
      creatorRole: "admin",
      organizationLimit: MAX_CLINICS_PER_USER,
      invitationExpiresIn: INVITATION_TTL_SECONDS,
      async sendInvitationEmail(data) {
        // No e-mail provider is chosen yet (open question). Never log invitation
        // links in production; fail loudly instead of silently dropping invites.
        if (env.NODE_ENV === "production") {
          throw new Error("Invitation e-mail provider is not configured");
        }
        console.info(`[dev] invitation for ${data.email}: /accept-invitation/${data.id}`);
      },
    }),
    nextCookies(), // must be the last plugin
  ],
});

export type Session = typeof auth.$Infer.Session;
