---
id: CTX-NTE-20261018-m0-implementation
type: note
title: M0 implementado: esqueleto, auth, isolamento por clínica e revisão de segurança
branch: architecture
tags: [architecture, auth, security, multi-tenancy, stack]
status: active
confidence: high
created_at: 2026-10-18
updated_at: 2026-10-18
related: [CTX-DEC-20261017-mvp-simplified, CTX-DEC-20261016-saas-multi-tenant, CTX-DEC-20261017-auth-email-password-invites]
---

# M0 implementation notes (2026-10-18)

## What exists (repo root)
- Next.js 16.4 (Cache Components on), React 19, Tailwind 4, shadcn/ui (base-nova style), Fraunces + Geist fonts; theme tokens in `app/globals.css` (paper background, ink-blue text, deep teal primary).
- PostgreSQL 16 in container `bumera-postgres` on the server (`~/bumera/compose.yml`, 512 MB limit, bound to server localhost, volume `bumera_pgdata`); databases `bumera_dev` and `bumera_test`. Credentials only in `~/bumera/.env` (server) and `.env.local` (local, git-ignored); `.env.example` lists names.
- Prisma 7.10 with `@prisma/adapter-pg`; generated client in `generated/prisma` (git-ignored, produced by `postinstall`). First migration `init` applied to dev and test.
- Better Auth 1.7: e-mail/password (min 10 chars), organization plugin (clinic = organization, creator role `admin`, roles admin/secretary/dentist in `lib/permissions.ts`, one clinic per user), session hook sets the active clinic at sign-in, `nextCookies` last.
- Pages: `/sign-in`, `/sign-up`, `/onboarding` (create clinic), `/agenda` (empty state, signed-in shell). `proxy.ts` does only an optimistic cookie redirect; pages re-validate the session on the server (`lib/session.ts`).
- Tenant isolation helper `lib/tenant-scope.ts` (`scopedPrisma`): injects `organizationId` in every filter, rejects cross-clinic writes (including relation connect and moving records), denies unregistered models, turns Prisma's silent null on cross-tenant upserts into an error. Only `Dentist` registered so far.
- Tests (Vitest 5, 27 passing, ~93% statements / 82% branches): env validation, test-DB guard, tenant isolation (real Postgres), roles, slugs. `npm run typecheck`, `lint` and `build` pass.

## Verified manually
Sign-up, wrong password message, sign-in, clinic creation, sign-out/in in the browser; API: second clinic refused (403), foreign Origin refused (403, CSRF).

## Security review (M0, inline)
OK: validated env, hashed passwords by library, origin check, session validated server-side, org limit, invitation e-mail fails loudly in production, secrets only in env.
Gaps / to do: no e-mail verification or password reset (needs e-mail provider: `CTX-QUE-20261018-email-provider`); sign-up is open (spam-clinic risk; rate limiting is Better Auth's default in production, to verify behind the tunnel); authorization checks per action (`hasPermission`) arrive with M1; RLS deferred to M4; raw SQL bypasses tenant scope (rule in AGENTS.md); `BETTER_AUTH_URL` must be https in production.

## Gotchas learned
- npm `latest` of `prisma` is 8.0 RC; pinned 7.x. `npx prisma init` also drops agent-skill folders: do not run it in the repo.
- `npx auth@latest generate` overwrites `prisma/schema.prisma`.
- Turbopack served stale CSS after the theme change until `.next` was deleted.
- Do not use `pkill -f "next dev"` from the shell tool (kills the shell); use `fuser -k 3000/tcp`.
