---
id: CTX-PLN-20261020-m1-registry-and-agenda
type: plan
title: M1: cadastros, agenda do dia, pendentes e acesso da equipe
branch: product
tags: [roadmap, calendar, patient, scheduling, auth]
status: in-progress
created_at: 2026-10-20
updated_at: 2026-10-20
related: [CTX-PLN-20261017-mvp-milestones, CTX-DEC-20261020-invite-codes-no-email, CTX-DEC-20261017-patient-duplicate-rules, CTX-DEC-20261017-roles]
---

# Plan M1 (awaiting user go-ahead)

Goal: a secretary can register dentists, procedures and patients, book appointments without conflicts, see the day's agenda and confirm pending items; the admin can bring the team in with codes. Test-first, 80%+ coverage, tenant-scoped, role-enforced. Reminders and WhatsApp are NOT in M1 (M2/M3).

## M1a Team access and e-mail on screen (`CTX-DEC-20261020-email-on-screen`)
- `EmailTransport` abstraction with an on-screen implementation (captures the message during the server action and returns it to the UI).
- Sign-up leads to an e-mail verification step; the code appears on screen.
- "Equipe" page: admin invites by e-mail + role using Better Auth invitations; the invitation link is displayed to copy; list of members and pending invitations. Invitee accepts via the link.
- Password reset deferred (not on screen: account-takeover risk).
- Tests: transport capture, invitation only usable by the invited e-mail, role assigned, cannot join another clinic.

## M1b Reference data and schema
- Prisma models + migration: `Procedure` (name, defaultDurationMin, active), `Dentist` (adds simple work days/hours), `Patient`, `Appointment`. Composite keys `(id, organizationId)` and composite foreign keys so an appointment can never point to another clinic's patient/dentist/procedure.
- Patient: name, CPF (AES-256-GCM encrypted + keyed hash, unique per clinic), phone E.164, birth date, status pending/confirmed, source secretary/whatsapp, consentAt, consentSource, doNotContact, optedOutAt. Duplicate rules per `CTX-DEC-20261017-patient-duplicate-rules` (CPF per clinic; patients without CPF allowed; conflict -> alert, no duplicate).
- Appointment: patient, dentist, procedure, startsAt/endsAt (timestamptz), status (pending, scheduled, confirmed, completed, cancelled, no_show), source. SQL exclusion constraint (btree_gist) forbids overlapping active appointments per dentist.
- Register Procedure, Patient, Appointment (and Dentist) in `TENANT_MODELS`.
- New env vars (names only): `CPF_ENCRYPTION_KEY`, `CPF_HASH_KEY`.

## M1c Pure libraries (TDD)
`cpf` (validate/normalize/mask), `phone` (BR to E.164), `crypto` (encrypt/decrypt/hash), `invite-code` (generate/hash/verify), `schedule` (clinic timezone America/Sao_Paulo, conflict-free slot listing from work hours and duration), zod schemas per entity.

## M1d Services and authorization
Server-side services over `scopedPrisma`, each checking the role (`lib/permissions.ts`: admin all, secretary registers/schedules, dentist read plus update own appointments). Zod input validation at every boundary; errors never leak internals.

## M1e UI (shadcn: table, dialog, select, badge, dropdown, toast)
`/agenda` (date navigation, list per dentist, new appointment with free-slot picker, status actions), `/pacientes` (search, create/edit, pending badge), `/pendentes` (confirmation queue for WhatsApp-origin records), `/dentistas`, `/procedimentos`, `/equipe` (codes, members). Existing visual theme; accessible forms; empty states; mobile-friendly.

## M1f End-to-end
Playwright smoke flow: sign up, create clinic, add dentist/procedure/patient, book, see on the agenda, conflict refused, secretary joins by code. Needs browser download (about 300 MB), asked before installing.

## Order and checkpoints
M1b schema + M1c libs first (no UI), then M1d, M1a, M1e, M1f. Commit per sub-milestone. Verify with typecheck, lint, tests, build and a manual browser pass.

## Risks
CPF key loss makes CPFs unrecoverable (back up the key outside the repo before real data); composite foreign keys complicate Prisma typings; timezone/DST edge cases; code brute force (mitigated by entropy + rate limit).

## Go-ahead
User authorized M1 on 2026-10-20 (including the Playwright install for M1f).

## Progress 2026-10-20
- M1b done: migration `m1_registry` (Procedure, Patient, Appointment, Dentist work hours; composite keys and composite foreign keys; per-clinic unique CPF hash; no-overlap exclusion constraint per dentist; end-after-start check). Registered in `TENANT_MODELS`. 14 database/tenant tests.
- M1c done: `lib/cpf.ts`, `lib/phone.ts`, `lib/crypto.ts` (AES-256-GCM + HMAC hash), `lib/schedule.ts` (free slots, clinic timezone via date-fns/@date-fns/tz). 26 tests.
- Totals: 67 tests, ~94% statements. Next: M1d services + permissions, then M1a, M1e, M1f.
- Not yet done: `CPF_ENCRYPTION_KEY` and `CPF_HASH_KEY` env vars (to create with M1d; names only in Context; back up the key before real data).
