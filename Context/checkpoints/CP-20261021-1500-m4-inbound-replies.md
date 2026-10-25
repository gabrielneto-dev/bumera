---
id: CTX-CP-20261021-1500-m4-inbound-replies
type: checkpoint
title: M4 primeiro corte: respostas 1/2/SAIR, respostas automáticas e mensagens estruturadas, testados no celular
branch: global
tags: [roadmap, whatsapp, evolution-api, n8n]
status: active
created_at: 2026-10-21
updated_at: 2026-10-21
---

# Session Checkpoint

## Objective
After M3, build M4: process the patient's WhatsApp replies and answer automatically.

## What changed
- Webhook Evolution -> app, reply parser, handlers for 1 / 2 / SAIR, Pendentes section for reschedule requests, auto-refresh, automatic replies through new `REPLY_*` reminder kinds, structured messages. Details: `CTX-NTE-20261021-m4-inbound-replies`, `CTX-DEC-20261021-replies-via-reminder-pipeline`.
- Commits: ce595c0, c58466c, 92d4d10 (all deployed to `~/bumera-app`; two migrations applied to `bumera_prod`). Earlier: dcc24ba..f50748e (M3).
- Verified end to end with the owner's phone (1, 2, SAIR and the failure branch). The test opt-out was reverted by SQL.

## Problems and causes
- Printing the response of `/webhook/set` leaked the webhook token into the transcript: rotated at once; never echo those responses.
- Only the `app` image was rebuilt at first, so the stale `migrate` image applied nothing: rebuild both.
- A test asserted "no `*` in messages": changed to check the greeting line now that the app adds its own bold.
- The permission classifier blocked writes to the shared infra Postgres and the pgAdmin stop; writes to `bumera_prod` needed an explicit user-added Bash permission rule (`ssh my-server`). Do not work around those blocks.

## Open
Opt-out reactivation UI and rule for SAIR vs appointments (`CTX-QUE-20261021-opt-out-reactivation`); Evolution hostname still public (`CTX-RSK-20261021-evolution-publicly-exposed`); CPF key backup off the server; test data still in `bumera_prod` (Gabriel Teste, Teste Falha); LGPD checklist, e-mail provider, password reset; backups last (user's wish).

## Next steps
Reactivation action on the patient screen, clean test data, protect public hostnames, then backups.
