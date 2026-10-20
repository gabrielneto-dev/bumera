# Project State

Last updated: 2026-10-20
Latest checkpoint: Context/checkpoints/CP-20261020-1021-m1-complete.md

## Current objective
Ship the pilot: confirmação/lembrete over WhatsApp for 1–3 dental clinics (modules 1–3, no AI), hosted on the user's server.

## Working (built, tested, committed through 81612fc)
- Next.js 16 app (front + back in one project) with Better Auth: clinics (SaaS multi-tenant), roles admin/secretary/dentist, team invitations, on-screen e-mail code verification.
- Registry and agenda: patients (encrypted CPF, per-clinic unique), dentists, procedures, appointments with database-enforced no-overlap, free-slot booking, day agenda, pending queue.
- Quality: 146 unit/integration tests (~94% statements) + 1 Playwright e2e; typecheck, lint, production build pass.
- Server (`ssh my-server`): clean Ubuntu + Docker with only the Bumera Postgres (`bumera_dev`, `bumera_test`); app runs locally through an SSH tunnel. Details: `CTX-NTE-20261020-m1-implementation`, `CTX-FCT-20261017-server-inventory`.

## Not built yet
Reminders for n8n (M2), first n8n flow + Evolution (M3), inbound WhatsApp / opt-out replies (M4), app deployment on the server, backups, n8n protection, LGPD checklist, e-mail provider, password reset.

## Blockers
None.

## Active decisions (full lists in the branch indexes)
Three engines (app, n8n, Evolution) · app owns the DB (PostgreSQL) · Next.js + Tailwind + shadcn/ui · MVP simplified (n8n polls the app for reminders) · e-mail shown on screen for now · modules 1–3 first, AI last · pilot with 1–3 clinics at ~R$50/month (not final) · backups deferred to first client; n8n temporarily exposed (accepted risks).

## Open questions
`CTX-QUE-20261018-app-deployment` · `CTX-QUE-20261016-service-auth` · `CTX-QUE-20261016-llm-usage-in-pilot` · `CTX-QUE-20261016-pilot-first-module-and-clinics` (which clinics; plan to research the ideal profile on request: `CTX-PLN-20261017-pilot-clinic-research`) · `CTX-QUE-20261018-email-provider` (postponed).

## Next likely steps
1. M2: `reminders` table recomputed with appointment changes, `GET /api/v1/reminders/due` and `POST .../result` with claim, retries and stale guard (`CTX-PLN-20261017-mvp-milestones`).
2. Decide deployment (Dockerfile/Compose, hostname, build memory) before M3.
3. Back up the CPF keys outside the repo before real patient data.
