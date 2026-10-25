---
id: CTX-NTE-20261021-m4-inbound-replies
type: note
title: M4 primeiro corte: respostas do paciente no WhatsApp (1, 2, SAIR), respostas automáticas e mensagens estruturadas
branch: architecture
tags: [architecture, whatsapp, evolution-api, webhook, n8n, security]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261021-m2-m3-implementation, CTX-DEC-20261021-replies-via-reminder-pipeline, CTX-DEC-20261016-inbound-routing-app-first]
---

# M4 slice 1 (commits ce595c0, c58466c, 92d4d10)

## Inbound
- Evolution calls `POST /api/webhooks/evolution/<token>` (route `app/api/webhooks/evolution/[token]/route.ts`). Secret = env `EVOLUTION_WEBHOOK_TOKEN` (>= 32 chars; unset = 503, wrong = 401, constant-time compare in `lib/webhook-auth.ts`). Body limit 64 KB; anything that is not a patient's text message is acknowledged with 200 (`IGNORED`) so Evolution does not retry.
- `lib/inbound/evolution.ts`: parses `messages.upsert` (also `MESSAGES_UPSERT`), ignores own messages, groups, status broadcasts, media, non-Brazilian numbers; uses `remoteJidAlt` when WhatsApp hides the number behind `@lid`; `phoneCandidates` handles the missing ninth digit of older accounts.
- `lib/inbound/intent.ts`: whole-message matches only: "1" confirm, "2" reschedule, "sair/parar/pare/descadastrar/cancelar mensagens" opt-out; everything else is ignored (no reply, no guessing).
- `lib/inbound/handle.ts`: runs across clinics (sender identified only by phone). Confirm: next upcoming live appointment becomes CONFIRMED (via `syncReminders`). Reschedule: `appointment.rescheduleRequestedAt` set, the other pending reminders cancelled; listed on Pendentes ("Pediram para remarcar", `listRescheduleRequests`). Opt-out: every patient record with that phone gets `doNotContact` + `optedOutAt`, pending reminders are SKIPPED. A confirmed or rescheduled appointment is never cancelled by the system; SAIR does not cancel appointments.
> Update 2026-10-22: replies are now scoped to the clinic whose WhatsApp number received them (`CTX-NTE-20261022-whatsapp-per-clinic`); SAIR no longer reaches other clinics.

## Automatic replies
New reminder kinds `REPLY_CONFIRMED`, `REPLY_RESCHEDULE`, `REPLY_OPTED_OUT` (see `CTX-DEC-20261021-replies-via-reminder-pipeline`). Queued by the inbound handler, due immediately, one per (appointment, kind); delivered by the same n8n workflow through /due and /result (no workflow change). The guard skips the schedule/consent checks for replies and only the opt-out acknowledgement is allowed after an opt-out; replies are retried until delivered. The opt-out acknowledgement attaches to the patient's latest appointment (none = no acknowledgement).
## Messages
`lib/reminders/messages.ts` now renders structured texts: paragraphs separated by blank lines, WhatsApp bold (`*...*`) for the clinic name and options, emojis for date/procedure/dentist. Names are still sanitized (no links or formatting from patient/clinic names). Tests that checked for no `*` now check the greeting line.
## UI
Agenda and Pendentes refresh themselves every 30 s while the tab is visible (`components/auto-refresh.tsx`).
## Operations
- The Evolution webhook is configured per instance: `POST /webhook/set/<instance>` with `{webhook:{enabled:true,url:"http://bumera-app:3000/api/webhooks/evolution/<token>",events:["MESSAGES_UPSERT"],webhookByEvents:false,webhookBase64:false}}` (header `apikey`). Done for `bumera-teste`; every new clinic instance needs it. The token was once printed in a tool output and was rotated immediately: never print the response of `/webhook/set` or `/webhook/find` (they echo the URL).
- Migrations `20261021150000_m4_inbound_replies`, `20261021160000_m4_reply_kinds`. When deploying, rebuild BOTH images (`build app` and `--profile tools build migrate`); a stale `migrate` image reports "No pending migrations".
- Verified on 2026-10-21 with the owner's phone: 1, 2 and SAIR each acted and each got its automatic reply; the failure branch (number not on WhatsApp) records `evolution_send_failed` and retries with backoff. After the SAIR test the opt-out was reverted directly in the database (there is no UI for it yet: `CTX-QUE-20261021-opt-out-reactivation`).
- Tests: 320, ~96% statements.
