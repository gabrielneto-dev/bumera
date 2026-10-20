---
id: CTX-DEC-20261017-default-trigger-timings
type: decision
title: Padrões iniciais de gatilhos por clínica (ajustáveis depois)
branch: product
tags: [triggers, product-modules]
status: active
confidence: medium
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261017-clinic-defined-reminders]
---

# Decision
Each clinic starts with default trigger rules, adjustable per clinic later (`CTX-DEC-20261017-clinic-defined-reminders`):
- appointment created: confirmation message (immediately)
- 24h before appointment: reminder asking confirmation
- 2h before appointment: reminder
- no-show: invite to reschedule (about 1h after the slot)
- procedure completed (marked by the dentist): reactivation after 6 months
- quote/treatment plan with no answer: follow-up after 7 days
The user asked for a default standard; the 7-day and no-show offsets are agent-suggested starting values.
