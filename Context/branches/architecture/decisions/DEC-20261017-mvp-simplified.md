---
id: CTX-DEC-20261017-mvp-simplified
type: decision
title: MVP simplificado: lembretes por polling do n8n, Better Auth, Prisma, Docker Compose
branch: architecture
tags: [architecture, stack, n8n, auth, database, triggers]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261016-three-engines, CTX-DEC-20261017-trigger-delivery-retries, CTX-DEC-20261017-default-trigger-timings]
---

# Decision
Approved by the user on 2026-10-17 (plan file `/home/neto/.claude/plans/pode-inciar-o-planejamento-gentle-axolotl.md`). The agent chose the technical defaults on the user's behalf; the user accepted them.

- **Reminders:** n8n (Schedule, every 5 min) calls `GET /api/v1/reminders/due`; the app returns and claims due reminders; n8n sends through Evolution and reports `POST /api/v1/reminders/{id}/result`. No outbox worker and no HMAC-signed app→n8n webhook in the MVP; services authenticate with a Bearer service key.
- **Auth:** Better Auth (e-mail/password, organizations = clinics, invitations, roles). To be confirmed against current docs before use.
- **DB/ORM:** PostgreSQL + Prisma; no-overlap constraint for appointments via raw SQL (exclusion constraint).
- **Tenant isolation:** one data-access helper that always filters by clinic_id, covered by isolation tests; RLS deferred to M4.
- **UI:** Next.js + Tailwind + shadcn/ui; agenda starts as a day list per dentist.
- **Runtime:** Docker Compose (app, Postgres, n8n, Evolution) behind the existing Cloudflare Tunnel.
- **Messages:** fixed texts, no AI in the pilot; replies "1 confirm / 2 reschedule"; "SAIR" handled by the app before forwarding.
- **Deferred:** quotes, reactivation, audit log, RLS, complex working hours, queue/worker, backups (first client), n8n protection (M4).

## Consequences
Supersedes the outbox/worker/HMAC parts of the drafts `CTX-NTE-20261017-data-model-draft` (scheduled_triggers outbox becomes a simpler `reminders` table) and `CTX-NTE-20261017-integration-contracts-draft` (section 1 and the signature rules). Other earlier decisions remain in force (inbound routing app-first, duplicate rules, pending WhatsApp records, consent/opt-out, defaults and retries).
