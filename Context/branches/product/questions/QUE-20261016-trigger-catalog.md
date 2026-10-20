---
id: CTX-QUE-20261016-trigger-catalog
type: question
title: Quais gatilhos de webhook existirão e como configurar atrasos?
branch: product
tags: [triggers, webhook]
status: answered
created_at: 2026-10-16
updated_at: 2026-10-17
resolved_by: CTX-DEC-20261017-default-trigger-timings
---

## Question
Quais gatilhos de webhook existirão e como configurar atrasos?

## Why this matters
Triggers power reativação, follow-up de orçamento and lembrete.

## What depends on the answer
Trigger scheduler design, n8n flows.

## Known options
Events: procedure finished (+N months), quote not closed (+N days), appointment created (reminder at T-24h/T-2h), no-show. Per-clinic configurable delays? Retry/idempotency?

## How to resolve
Answer in the questionnaire (user), then record a DEC and mark this answered.

## Partial answer (2026-10-17)
Timings are defined by each clinic; initial reminder moments and future self-service programming: `CTX-DEC-20261017-clinic-defined-reminders`. Still open: other event types (reactivation, quote follow-up delays), retry/idempotency, configuration UI.

## Answer (2026-10-17)
Defaults and retries: `CTX-DEC-20261017-default-trigger-timings`, `CTX-DEC-20261017-trigger-delivery-retries`.
