---
id: CTX-CP-20261021-1600-clinic-settings
type: checkpoint
title: Reativação testada no WhatsApp e horários de mensagens configuráveis por clínica
branch: global
tags: [roadmap, product-modules, triggers, whatsapp]
status: active
created_at: 2026-10-21
updated_at: 2026-10-21
---

# Session Checkpoint

## What changed
- Reactivation tested for real on the owner's phone (procedure period 6 months, appointment completed in the UI, invitation brought forward by SQL, reply 1 recorded and answered, Pendentes entry).
- Per-clinic timings: `clinic_settings`, Mensagens screen, live re-planning, generic reminder wording. Commit 98da1eb, 409 tests, ~96%. Record: `CTX-NTE-20261021-clinic-settings`.

## Problems and causes
- None blocking. A sed-style SQL `like` on an enum column failed (cast needed); a partial python save script from before was already fixed.

## Open
Module 4 (AI, last); e-mail provider, password reset, off-machine backup (user wants them at the end); Evolution hostname public and CPF key copy off the server (owner actions); test data in `bumera_prod`; message texts and quiet hours not configurable.

## Next steps
Decide whether to start module 4 or the end-of-project items; keep taking a `backup.sh` run before each migration.
