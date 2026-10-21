# Project State

Last updated: 2026-10-21
Latest checkpoint: Context/checkpoints/CP-20261021-1018-m2-redesign-infra.md

## Current objective
Ship the pilot: confirmação/lembrete over WhatsApp for 1–3 dental clinics (modules 1–3, no AI), hosted on the user's server.

## Working
- Next.js 16 app (front + back) with Better Auth: clinics (SaaS multi-tenant), roles admin/secretary/dentist, invitations, on-screen e-mail codes. Registry and agenda (patients with encrypted CPF, dentists, procedures, appointments with DB-enforced no-overlap, pending queue).
- **UI redesigned** (left sidebar, dark mode, motion, branded auth/404 pages): `CTX-NTE-20261021-ui-redesign`. Pushed to GitHub.
- **M2 reminders built** (local commit 79bd0e6, push pending): reminders recomputed with appointment changes, `GET /api/v1/reminders/due` + `POST .../result` (Bearer service key), stale guard, consent check, retries, failed-message alert on Pendentes: `CTX-NTE-20261021-m2-implementation`.
- Quality: 250 unit/integration tests (~95.6% statements) + 1 Playwright e2e; typecheck, lint pass.
- **Server** (`ssh my-server`): generic infra in `~/infra` — Postgres 16, pgAdmin, n8n 2.44.5 (per-project databases via `new-db.sh`), all on 127.0.0.1; n8n also at `https://n8n.gnslab.com.br` via Cloudflare Tunnel with webhook URL configured: `CTX-FCT-20261021-server-infra-state`, `CTX-DEC-20261021-generic-shared-infra`. App still runs locally through SSH tunnels (`npm run db:tunnel`, `npm run ui:tunnel`).

## Not built yet
First n8n flow + Evolution (M3), inbound WhatsApp / opt-out replies (M4), app deployment on the server, backups, n8n protection, LGPD checklist, e-mail provider, password reset.

## Blockers
None. The n8n MCP is registered locally as `n8n-mcp` (Connected, needs `npm run ui:tunnel`); its tools only load in a **new** Claude session — verify there (`CTX-QUE-20261021-n8n-mcp-access`).

## Active decisions (full lists in the branch indexes)
Three engines (app, n8n, Evolution) · app owns its DB · Next.js + Tailwind + shadcn/ui · MVP simplified (n8n polls the app) · e-mail on screen for now · modules 1–3 first, AI last · generic shared infra under `~/infra` · reminders require consent and are never stale (agent-chosen, to review) · pilot with 1–3 clinics at ~R$50/month (not final) · backups deferred to first client; n8n exposed publicly with login only (accepted risk).

## Open questions
`CTX-QUE-20261021-n8n-mcp-access` · `CTX-QUE-20261018-app-deployment` · `CTX-QUE-20261016-service-auth` (partly answered) · `CTX-QUE-20261016-llm-usage-in-pilot` · `CTX-QUE-20261016-pilot-first-module-and-clinics` · `CTX-QUE-20261018-email-provider` (postponed).

## Next likely steps
1. Open a new session and verify the n8n MCP tools (read-only test first).
2. Decide app deployment (own compose project under `~/bumera`, hostname, build memory) before M3.
3. M3: n8n flow polling due reminders, sending through Evolution, reporting results.
4. Remove the old stopped Bumera stack once confirmed; back up `N8N_ENCRYPTION_KEY` and the CPF keys outside the server.
