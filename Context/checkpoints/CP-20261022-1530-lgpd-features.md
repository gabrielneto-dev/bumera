---
id: CTX-CP-20261022-1530-lgpd-features
type: checkpoint
title: Lacunas de LGPD fechadas: registro de atividades, exportação e exclusão de dados do paciente
branch: global
tags: [lgpd, privacy, roadmap]
status: active
created_at: 2026-10-22
updated_at: 2026-10-22
---

# Session Checkpoint

## What changed
- Activity log, export and erasure of patient data, with the Atividades screen and the Exportar / Apagar dados buttons (commit 48d3e27, 497 tests, ~96.7%). Record: `CTX-NTE-20261022-lgpd-audit-export-erasure`; checklist note updated.
- Verified in production: export logged and visible on Atividades. Erasure not exercised in production (see the note).

## Problems and causes
- Audit order depends on the database clock, so tests use the real `createdAt`, not the fixed test "now".
- The audit screen needs actor names from the Better Auth user table, which the tenant-scoped client cannot read: the page reads them with the plain client.

## Open
Module 4 (AI); e-mail provider, password reset, off-machine backup (user wants these at the end); erasure inside Evolution, retention policy, read logging; creating an Evolution instance/QR from the app; Docker build cache cleanup (disk 65%); Evolution hostname public and CPF keys off-server (owner actions); test data in `bumera_prod`; legal documents need a lawyer.

## Next steps
Module 4 or the end-of-project items; the owner can try "Apagar dados" on the test patient "Teste Falha".
