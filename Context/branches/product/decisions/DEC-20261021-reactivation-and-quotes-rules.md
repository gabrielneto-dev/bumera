---
id: CTX-DEC-20261021-reactivation-and-quotes-rules
type: decision
title: Regras dos módulos 1 e 2: prazo de reativação por procedimento; orçamento cadastrado pela secretária com follow-up no dia 2 e 7
branch: product
tags: [product-modules, triggers, pilot]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261021-modules-1-2-reactivation-quotes, CTX-DEC-20261017-default-trigger-timings, CTX-DEC-20261017-clinic-defined-reminders]
---
# Decision (user answers on 2026-10-21)
- **Reactivation:** each procedure has "reactivate after N months" (empty = never). When an appointment is completed the system schedules the return invitation.
- **Quotes:** the secretary registers them on the Orçamentos screen (patient, what was quoted, optional internal value); the system follows up at +2 and +7 days and treats the quote as expired after 14 days; the secretary closes it as "Fechado" or "Perdido".
- **Replies to both campaigns:** 1 = wants to talk to / schedule with the team (secretary calls from Pendentes), 2 = not now (closes a quote). Both get an automatic answer.
## Not decided / next
Per-clinic configurable timings (24h, 2h, day 2, day 7, expiry are constants in code today); a quote created from a completed appointment (the user chose the manual screen); import from spreadsheets.
