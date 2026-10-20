---
id: CTX-NTE-20261020-m1-implementation
type: note
title: Mapa do código do M1: onde está cada coisa e as convenções
branch: architecture
tags: [architecture, stack, auth, multi-tenancy, triggers]
status: active
confidence: high
created_at: 2026-10-20
updated_at: 2026-10-20
related: [CTX-NTE-20261018-m0-implementation, CTX-PLN-20261020-m1-registry-and-agenda]
---

# M1 code map and conventions (state at commit 81612fc, 2026-10-20)

## Layers (read in this order when changing behavior)
1. **Database** (`prisma/`): Better Auth tables + Bumera tables. Migrations `init` and `m1_registry` (composite `(id, organizationId)` keys and composite foreign keys, per-clinic unique CPF hash, end-after-start CHECK, btree_gist exclusion constraint against overlapping appointments per dentist).
2. **Pure libraries** (`lib/`): `cpf`, `phone` (E.164), `crypto` (AES-256-GCM + HMAC), `schedule` (free slots, working-hours check; clinic timezone fixed to America/Sao_Paulo), `dates`, `schemas` (zod, Portuguese messages), `errors` (`AppError` codes), `authz` (`can`/`assertCan` over `lib/permissions.ts`), `db-errors` (P2002 unique, P2039+23P01 overlap), `email` (transport), `safe-redirect`, `auth-errors`, `labels`, `form-data`.
3. **Tenant isolation** (`lib/tenant-scope.ts`): `scopedPrisma(prisma, organizationId)`; tenant models: Dentist, Procedure, Patient, Appointment. Better Auth tables (Member, Invitation) are read with the plain client and an explicit clinic filter (`lib/services/team.ts`).
4. **Services** (`lib/services/*`): receive a `ServiceContext` (scoped db, organizationId, userId, role, CPF keys, clock). They check permission, validate input, translate DB errors into `AppError`. Patients (encrypted CPF, duplicate rule, search, confirm), dentists, procedures, appointments (book, status workflow, day agenda, pending, free slots), team. `lib/services/server.ts` builds the context from the validated session (memoized per request; role read from the database).
5. **Server actions** (`app/**/actions.ts`): thin; `runAction` converts `AppError` into field errors/messages and lets Next redirects through.
6. **UI** (`app/(app)/*`, `components/form/*`): pages call services; `ActionDialog` + `TextField`/`SelectField`/`CheckboxField` keep submitted values on error; role-based navigation; `loading.tsx`; pages export `instant = false` (per-user).

## Rules that are easy to break
- Never trust the client for role or clinic: derive them on the server.
- New tenant table: add `organizationId`, composite keys/FKs if referenced, register in `TENANT_MODELS`, add isolation tests.
- Reads of `new Date()` in pages must come after a request-time data read (Cache Components).
- Everything e-mailed goes through `emailTransport` (on screen now); password-reset codes must not be shown on screen.
- Roles: admin (everything + team), secretary (patients, appointments, reads), dentist (reads, update own... currently all appointments).

## Tests
`npm run test:coverage` (146 tests, ~94% statements; real Postgres `bumera_test` via tunnel) and `npm run test:e2e` (Playwright, port 3100, `bumera_test`). Env names: DATABASE_URL, TEST_DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CPF_ENCRYPTION_KEY, CPF_HASH_KEY.

## Dev data
`bumera_dev` on the server holds test accounts and a test clinic created by hand (admin marina.m1@example.com, secretary sonia.secretaria@example.com; passwords only in the chat history). Empty it before any real data: `TRUNCATE "organization","user","verification" CASCADE`.
