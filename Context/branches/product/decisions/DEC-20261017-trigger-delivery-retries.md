---
id: CTX-DEC-20261017-trigger-delivery-retries
type: decision
title: Falha no disparo: tentar novamente com intervalos crescentes; depois avisar a secretária; nunca enviar lembrete obsoleto
branch: product
tags: [triggers, webhook]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261016-webhook-triggers]
---

# Decision
If a trigger/reminder delivery fails (e.g. WhatsApp disconnected): retry a few times with increasing intervals; if it still fails, mark it failed and alert the secretary. Never send a stale reminder (e.g. appointment already started or cancelled). Proposed by the agent, approved by the user. Exact attempt count/intervals are tunable (draft: 5 attempts, ~1m/5m/30m/2h/6h, capped by the appointment time).
