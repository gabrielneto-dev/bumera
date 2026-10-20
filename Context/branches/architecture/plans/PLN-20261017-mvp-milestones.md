---
id: CTX-PLN-20261017-mvp-milestones
type: plan
title: Marcos do MVP simplificado (M0–M4)
branch: architecture
tags: [roadmap, pilot]
status: in-progress
created_at: 2026-10-17
updated_at: 2026-10-18
related: [CTX-DEC-20261017-mvp-simplified]
supersedes: CTX-PLN-20261017-build-milestones
---

# Plan (approved)
Test-first (TDD), 80%+ coverage, security review on auth/data code.
- **M0 Skeleton:** Next.js + Tailwind + shadcn/ui, Compose with Postgres, Prisma, Better Auth, tenant-scope helper + isolation tests.
- **M1 Registry and agenda:** dentists, procedures, patients (encrypted CPF + unique hash per clinic, E.164 phone, consent, do_not_contact), anti-overlap appointments, day list, pending queue.
- **M2 Reminders:** `reminders` table recomputed in the same transaction as appointment changes; `due`/`result` endpoints with `FOR UPDATE SKIP LOCKED` claim, backoff retries, stale guard.
- **M3 First n8n flow:** exported workflow in `n8n/workflows/`, send via Evolution (test WhatsApp), message_log.
- **M4 Inbound and hardening:** Evolution webhook, SAIR, replies 1/2, pending; then protect n8n/Evolution, minimal backup, LGPD checklist, RLS.
Repo layout and verification steps are in the plan file named in `CTX-DEC-20261017-mvp-simplified`.

## Progress 2026-10-18
M0 mostly done (see `CTX-NTE-20261018-m0-implementation`). Remaining in M0: browser e2e test (Playwright) and app container/deploy on the server (`CTX-QUE-20261018-app-deployment`). Next: M1.
