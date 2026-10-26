---
id: CTX-NTE-20261025-f1-worker-pipeline
type: note
title: Mapa do código da F1 (worker no lugar do buffer por setTimeout e do envio pelo n8n)
branch: ai-agent
tags: [ai-assistant, whatsapp, outbox, n8n, webhook]
status: superseded
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-26
related: [CTX-DEC-20261025-migration-roadmap, CTX-DEC-20261025-queue-pg-boss, CTX-RES-20261025-module4-gap-analysis]
superseded_by: CTX-DEC-20261026-whatsapp-in-n8n
---

# F1 code map (branch claude/ai-cyclic-architecture)

## Switch
`WHATSAPP_SENDER` (`lib/whatsapp/mode.ts`): `n8n` (default, legacy: webhook buffer with `setTimeout` + n8n polls `/due`) or `worker`. App and worker read the same env value. In `worker` mode `/api/v1/reminders/due` returns `[]` with `meta.sender = "worker"` (no double send if the workflow stays active).

## Inbound (worker mode)
Webhook `app/api/webhooks/evolution/[token]/route.ts` → `scheduleTurn` (`lib/whatsapp/turn.ts`): stores in `inbound_buffer`, then `enqueueDebounced(TURN_JOB)` with key/group `turn:<org>:<phone>` and delay from `lib/inbound/debounce.ts` (6 s +2 s per message, 20 s window cap, 45 s max wait). Producer pg-boss client: `lib/queue/producer.ts` (no supervision/cron). Worker `runTurn` → `flushNumber` (`lib/inbound/buffer.ts`): answers the burst via `handleInboundMessage` **then** deletes the rows (crash-safe; handler idempotent per message id), then `requestDispatch`.

## Outbound (worker mode)
`lib/whatsapp/sender.ts`: `runDispatch` = `claimDueReminders` (same rules as /due) → one `SEND_JOB` per message (ids only), group `send:<instance>`, replies priority 10; cron every minute + immediate after a turn. `runSend` = `loadClaimedReminder` (`lib/reminders/dispatch.ts`) → wait `sendDelayMs` (`lib/whatsapp/pacing.ts`: 3 s gap + 0–2 s jitter per number; replies typing delay 1.5–6 s counted from creation) → recheck claim → `createEvolutionChannel().sendText` (`lib/whatsapp/evolution-client.ts`, error codes only) → `recordReminderResult` (now stores `providerMessageId`). Pacer remembers the last send per instance (memory, DB fallback).

## Worker wiring
`lib/whatsapp/jobs.ts` (specs), `lib/whatsapp/queues.ts` (`whatsappWorkerSetup`: queues + cron; in `n8n` mode nothing and the cron is removed), `worker/main.ts`, `lib/queue/worker.ts` (schedules, unschedule). Deploy: `Dockerfile` target `worker` (tsx on the build stage), service `worker` in `deploy/compose.app.yml`, runbook in `deploy/README.md` ("Worker and the WhatsApp sender switch").

## Media (both modes)
`lib/inbound/evolution.ts` keeps audio/image/video/document (`mediaKind`, caption as text); `lib/inbound/media.ts` → `inbound_message` "[Áudio]"… + `REPLY_MEDIA`; first contacts answered via `inbound_message.phoneE164` (`senderPatient` in dispatch). Burst with text + media: text wins (`joinBurst`). Migration `20261025220000_f1_media_and_provider_id`.

## Verified
848 tests (96.3%); e2e test `tests/whatsapp/pipeline.test.ts`: "1" on the webhook → confirmation sent by the worker in ~10 s (target < 20 s). Local `npm run build` and `worker:dev` in worker mode (health 200, 3 queues + cron). Not yet deployed.

## Gotchas
- pg-boss `work()` renews heartbeats itself; `groupConcurrency` raced inside one process → `localGroupConcurrency: 1` (single worker replica).
- Two buffer rows with the same `receivedAt` are ordered by random id: tests must use distinct times.

## Superseded (2026-10-26)
Code removed (worker, queue, sender, media reply).
