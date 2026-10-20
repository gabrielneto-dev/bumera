import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, organization } from "better-auth/plugins";
import { emailTransport } from "@/lib/email";
import { getEnv } from "@/lib/env";
import { ac, clinicRoles } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const MIN_PASSWORD_LENGTH = 10;
const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_CLINICS_PER_USER = 1;
const VERIFICATION_CODE_LENGTH = 6;
const VERIFICATION_CODE_TTL_SECONDS = 600;
const VERIFICATION_CODE_ATTEMPTS = 3;

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
        // Delivered on screen to the admin who created it (CTX-DEC-20261020-email-on-screen).
        await emailTransport.send({
          to: data.email,
          kind: "invitation",
          link: `${env.BETTER_AUTH_URL}/convite/${data.id}`,
        });
      },
    }),
    emailOTP({
      otpLength: VERIFICATION_CODE_LENGTH,
      expiresIn: VERIFICATION_CODE_TTL_SECONDS,
      allowedAttempts: VERIFICATION_CODE_ATTEMPTS,
      async sendVerificationOTP({ email, otp, type }) {
        // Only e-mail verification is supported: showing a password-reset code on screen
        // would let anyone take over an account.
        if (type !== "email-verification") {
          throw new Error(`Verification code type "${type}" is not enabled`);
        }
        await emailTransport.send({ to: email, kind: "verification-code", code: otp });
      },
    }),
    nextCookies(), // must be the last plugin
  ],
});

export type Session = typeof auth.$Infer.Session;
