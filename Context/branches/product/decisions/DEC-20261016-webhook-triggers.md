---
id: CTX-DEC-20261016-webhook-triggers
type: decision
title: O app dispara gatilhos para webhook a partir de eventos (ex.: procedimento finalizado + atraso)
branch: product
tags: [triggers, webhook, product-modules]
status: active
confidence: high
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-DEC-20261016-three-engines]
---

# Decision
Beyond scheduling, the app's extra capability is **configurable triggers that fire a webhook**. Example: when a given procedure is finished, fire a specific trigger after a delay (e.g. 6 months) — this powers reativação. Triggers are consumed by n8n flows.

## Not yet defined
Trigger catalog, delay configuration, retry/idempotency — see `CTX-QUE-20261016-trigger-catalog`.
