# Project State

Last updated: 2026-10-16
Latest checkpoint: Context/checkpoints/CP-20261018-1325-m0-skeleton.md

## Current objective
Define the architecture details and start building the app engine (dental scheduling + webhook triggers), then n8n WhatsApp flows. Pilot with 1–3 clinics.

## Approved plan
`CTX-DEC-20261017-mvp-simplified`, `CTX-PLN-20261017-mvp-milestones` (drafts `CTX-NTE-20261017-*-draft` are the reference, adjusted by the decision)

## Working
M0 built locally (Next.js + Prisma + Better Auth + tenant isolation), running against the Bumera dev Postgres on the server through an SSH tunnel. M1 committed; not deployed.

## In progress
Questionnaire sessions to close open questions.

## Blockers
None hard. Data model needs multi-tenancy, calendar and trigger answers.

## Last completed plan
`CTX-PLN-20261020-m1-registry-and-agenda`: M1 complete (schema, libs, services, pages, team, on-screen e-mail, Playwright e2e)

## Active decisions
- No e-mail provider for now; e-mail content is shown on screen via an `EmailTransport` — `CTX-DEC-20261020-email-on-screen`
- M0 implementation facts and gotchas — `CTX-NTE-20261018-m0-implementation`
- No Proxmox; server wiped of old workloads, own n8n/Postgres for Bumera — `CTX-DEC-20261018-no-proxmox-clean-server`
- MVP simplified (polling reminders, Better Auth, Prisma, Compose) — `CTX-DEC-20261017-mvp-simplified`
- Three engines: Next.js app (front+back together), n8n, Evolution API (separate) — `CTX-DEC-20261016-three-engines`
- Only the app owns the DB; others use its API — `CTX-DEC-20261016-single-db-owner`
- Next.js + Tailwind + shadcn/ui; n8n — `CTX-DEC-20261016-stack-nextjs-n8n`
- SaaS multi-tenant (one installation, isolated clinics) — `CTX-DEC-20261016-saas-multi-tenant`
- PostgreSQL — `CTX-DEC-20261016-postgresql`
- WhatsApp inbound: Evolution → app → n8n, verify Evolution capability — `CTX-DEC-20261016-inbound-routing-app-first`
- Pilot starts with confirmação/lembrete — `CTX-DEC-20261016-pilot-first-module`
- 1–N dentists per clinic; roles: admin, secretary, dentist; reminder timing defined per clinic — `CTX-DEC-20261017-*`
- Patient minimum fields; WhatsApp registrations/bookings pending until secretary confirms; no duplicate patients; consent + opt-out — `CTX-DEC-20261017-*`
- Duplicate rule: CPF unique per clinic; conflicts alert the secretary — `CTX-DEC-20261017-patient-duplicate-rules`
- Auth: e-mail/password via vetted library, admin invites team — `CTX-DEC-20261017-auth-email-password-invites`
- Backups deferred to first client; n8n temporarily exposed (accepted risks) — `CTX-DEC-20261017-defer-backups`, `CTX-DEC-20261017-network-exposure-phased`
- Trigger defaults and delivery retries — `CTX-DEC-20261017-default-trigger-timings`, `CTX-DEC-20261017-trigger-delivery-retries`
- Hosted on user's home machine (Cloudflare Tunnel + own domain) — `CTX-DEC-20261016-self-hosted-home-server`
- Modules 1–3 first, AI last — `CTX-DEC-20261014-module-sequencing`
- Pilot: 1–3 clinics at ~R$50/month, feedback-based (assumption/plan, not final)

## Open critical questions
Backlog: all `CTX-QUE-20261016-*` (see branch indexes). Most urgent: M2 reminders for n8n polling, `CTX-QUE-20261018-app-deployment`, CPF key backup before real data, `llm-usage-in-pilot`, pilot clinics.

## Next likely steps
M2: reminders (`reminders` table recomputed with appointment changes, `due`/`result` endpoints), then M3 first n8n flow; decide deployment before M3.
