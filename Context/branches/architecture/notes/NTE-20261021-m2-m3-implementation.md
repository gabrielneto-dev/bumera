---
id: CTX-NTE-20261021-m2-m3-implementation
type: note
title: Mapa do M2 (lembretes) e do M3 (deploy + primeiro fluxo n8n): código, servidor, operação
branch: architecture
tags: [architecture, n8n, evolution-api, whatsapp, infrastructure]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261020-m1-implementation, CTX-DEC-20261021-shared-infra-app-deployment, CTX-PLN-20261017-mvp-milestones]
---

# M2 and M3 code and operations map (commits 79bd0e6, dcc24ba, 447382f, f2e55a5)

## M2: reminders (`lib/reminders/`, `lib/services/reminders.ts`)
- Table `reminder` (tenant-scoped, composite FK to the appointment, unique `(appointmentId, kind)`): kinds confirmation, 24h, 2h, no-show follow-up; statuses PENDING/CLAIMED/SENT/FAILED/CANCELLED. `plan.ts` computes the plan, `sync.ts` recomputes it in the same transaction as every appointment change, `guard.ts` is the stale guard (cancelled/started/old no-show, consent, opt-out, retry backoff, `MAX_ATTEMPTS`), `messages.ts` renders pt-BR text (names sanitized), `dispatch.ts` claims (`FOR UPDATE SKIP LOCKED`, claim TTL 10 min) and records results (idempotent, ignores older attempts).
- API (Bearer `SERVICE_API_KEY`, envelope `{success,data,error,meta}`): `GET /api/v1/reminders/due?limit=1..50` (claims and returns `{id, kind, attempt, message, clinic, patient{phone E.164}, appointment}`), `POST /api/v1/reminders/{id}/result` with `{"outcome":"sent","attempt":N}` or `{"outcome":"failed","attempt":N,"error":"..."}`. No key configured = 503, wrong key = 401.
- Failed reminders are listed on the Pendentes screen. The `reminder` table doubles as the delivery log (status, attempts, `sentAt`, `note` without PII), so the planned `message_log` table was not built.

## M3: deploy and first flow
- `Dockerfile` (runtime + one-shot `migrate` stage; build placeholders for env validation live only in the build stage), `next.config.ts` has `output: "standalone"`, `deploy/compose.app.yml`, `deploy/README.md` (runbook), `n8n/workflows/reminders-whatsapp.json`.
- Workflow "Bumera - Lembretes por WhatsApp": schedule every 5 min -> GET /due -> split -> POST Evolution `/message/sendText/bumera-teste` (4 s between sends) -> POST /result sent, or failed with fixed error code `evolution_send_failed` (never the phone or text). Credentials in n8n are Header Auth: "Bumera service key" and "Evolution API key" (values only in the owner's vault and the server `.env`).
- Verified end to end on 2026-10-21: appointment created in the app (via browser), reminder became SENT (attempts 1) and the patient received the message on WhatsApp; a reminder for an already-started appointment was CANCELLED by the guard. The workflow was published (active). The failure branch was not exercised end to end.

## Gotchas
- BuildKit DNS fails on the server: the compose build uses `network: host`.
- Next evaluates route modules while building, so env validation needs placeholder values in the build stage.
- Evolution v2.3.7 image is `evoapicloud/evolution-api`; it needs Postgres (own database `evolution`, schema `evolution_api`) and Redis. Instance `bumera-teste` uses Baileys (unofficial, see `CTX-RSK-20261014-whatsapp-unofficial-api`).
- The n8n MCP token can expire (401); the workflow can always be imported through the UI.
- The sent message promises "1 confirm / 2 reschedule / SAIR": inbound handling is M4 and does not exist yet.
