---
id: CTX-PLN-20261017-mvp-milestones
type: plan
title: Marcos do MVP simplificado (M0–M4)
branch: architecture
tags: [roadmap, pilot]
status: in-progress
created_at: 2026-10-17
updated_at: 2026-10-21
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

## Progress 2026-10-20
M0 and M1 done (the originally planned M1 was split into M1a-M1f and completed). Next: M2 reminders, M3 first n8n flow, M4 inbound and hardening. App deployment decision needed before M3 (`CTX-QUE-20261018-app-deployment`).

## Progress 2026-10-21
M2 done (commit 79bd0e6). M3 done: app, Evolution and Redis deployed in `~/bumera-app`, workflow `n8n/workflows/reminders-whatsapp.json` published and verified end to end with a real WhatsApp message; `message_log` dropped (the `reminder` table is the log). Next: M4 inbound and hardening (see `CTX-NTE-20261021-m2-m3-implementation`).
