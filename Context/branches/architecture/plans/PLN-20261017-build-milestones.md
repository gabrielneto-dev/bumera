---
id: CTX-PLN-20261017-build-milestones
type: plan
title: Marcos de construção até o piloto (rascunho)
branch: architecture
tags: [roadmap, pilot]
status: superseded
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261014-module-sequencing, CTX-NTE-20261017-data-model-draft]
superseded_by: CTX-PLN-20261017-mvp-milestones
---

# Plan (candidate, awaiting user review)
Follow the repo rules: tests first (TDD), 80% coverage, security review on auth/data code.
- **M0 Skeleton:** Next.js + Tailwind + shadcn/ui, PostgreSQL, migrations, auth (e-mail/password, invitations), tenant scoping + RLS with isolation tests.
- **M1 Registry + calendar UI:** clinics, dentists, procedures, availability, patients (with duplicate rules), day/week agenda.
- **M2 Appointments + trigger engine:** overlap-proof appointments, trigger rules with defaults, scheduled_triggers outbox, worker, retries.
- **M3 First n8n flow:** signed webhook to n8n, reminder flow, Evolution send, delivery callback, message_log.
- **M4 Inbound:** Evolution webhook, opt-out, reply handling (confirm/reschedule), pending queue for the secretary.
- **M5 Pre-pilot hardening:** protect n8n/Evolution, backups, monitoring, LGPD checklist and consent texts.
Deferred: quotes (module 2) and reactivation flows after M3 proves the chain; AI module last.
