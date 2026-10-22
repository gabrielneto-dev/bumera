---
id: CTX-CP-20261022-1300-whatsapp-per-clinic
type: checkpoint
title: Horário de silêncio, limite diário e WhatsApp por clínica no ar
branch: global
tags: [roadmap, whatsapp, evolution-api, multi-tenancy, triggers]
status: active
created_at: 2026-10-22
updated_at: 2026-10-22
---

# Session Checkpoint

## What changed
- Quiet hours and daily send limit per clinic (commit 66c4c1d), enforced when n8n polls; replies exempt.
- One WhatsApp instance per clinic (commit c4345d1): column, admin WhatsApp screen with connection state, `/due` carries the instance, n8n workflow edited and published through its UI to use it, inbound routing by instance, replies/opt-out scoped to the clinic, warning on Pendentes, runbook for adding a clinic. 476 tests, ~96%.
- Server check on 2026-10-22: all containers up (app 16 h, others 21 h), daily backup at 03:30 UTC ok, n8n 264 production executions with 0 failures; disk at 65% (Docker build cache grew it from 12 GB to 34 GB used).

## Problems and causes
- Existing tests assumed "no clinic WhatsApp needed" and "look the patient up across clinics": a `connectWhatsapp` helper and per-clinic expectations replaced them.
- A DB CHECK of `dailySendLimit >= 10` blocked small test limits: the DB now only rejects nonsense (1-1000), the service enforces 10-1000; the migration was edited before reaching production and the test DB constraint fixed by hand.
- n8n expression editor auto-closes `{{`: typing the closing `}}` doubled it; remove the extra braces and check the preview.
- Chrome extension disconnected twice: production checks fall back to SQL on test data.

## Open
Module 4 (AI); LGPD gaps (audit log, patient export/deletion); e-mail provider, password reset, off-machine backup (user wants these at the end); creating an Evolution instance/QR from the app; Docker build cache cleanup (disk 65%); Evolution hostname public and CPF keys off-server (owner actions); test data in `bumera_prod`.

## Next steps
Pick between LGPD gaps (audit log, export/deletion), module 4, or the end-of-project items; consider pruning Docker build cache.
