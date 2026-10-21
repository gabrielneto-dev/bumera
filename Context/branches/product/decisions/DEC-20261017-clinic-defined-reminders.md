---
id: CTX-DEC-20261017-clinic-defined-reminders
type: decision
title: Momentos de lembrete são definidos pela clínica; conjunto inicial e programação futura
branch: product
tags: [triggers, product-modules, scheduling]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261016-webhook-triggers]
---

# Decision
When to notify the patient is defined by each clinic. Initial set of reminder moments: on scheduling (confirmation), 24h before (asking confirmation), 2h before, and after a no-show (invite to reschedule). In the future the clinic itself will be able to program this kind of operation (self-service trigger configuration).

## Consequences
Trigger timings must be per-clinic data, not hard-coded. See `CTX-DEC-20261016-webhook-triggers`; still open in `CTX-QUE-20261016-trigger-catalog`: retry/idempotency and the configuration UI.

## Update 2026-10-21
Implemented as the admin-only Mensagens screen (`CTX-NTE-20261021-clinic-settings`): confirmation on/off, two reminders (hours before), no-show invite (delay), quote follow-up days and validity. Message texts stay fixed.
