---
id: CTX-DEC-20261025-single-sender-outbox
type: decision
title: Remetente único — lembretes também saem pelo outbox do worker
branch: ai-agent
tags: [whatsapp, reminders, outbox, n8n]
status: active
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-PLN-20261017-mvp-milestones, CTX-NTE-20261021-m2-implementation, CTX-RSK-20261014-whatsapp-unofficial-api]
supersedes: null
superseded_by: null
---

# Decision
Every WhatsApp message (conversation replies and M2 reminders) leaves through one outbox and one sender per WhatsApp number in the worker, with pacing, jitter, daily cap, send window and idempotent ledger. The planned M3 n8n flow is dropped; a worker task reuses `lib/reminders/dispatch.ts`.

## Rationale
Anti-ban pacing only works if one place counts sends per number.

## Consequences
`GET /api/v1/reminders/due` + `POST .../result` stay for now but lose their only planned consumer; remove or keep for manual use when the worker task lands. Approved by the user on 2026-10-25.
