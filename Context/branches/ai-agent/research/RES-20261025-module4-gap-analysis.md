---
id: CTX-RES-20261025-module4-gap-analysis
type: research
title: Análise de lacunas do módulo 4 (IA no WhatsApp) frente ao plano cíclico
branch: ai-agent
tags: [ai-assistant, whatsapp, architecture, webhook]
status: active
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-PLN-20261025-ai-whatsapp-architecture, CTX-NTE-20261024-booking-dialog, CTX-NTE-20261024-ai-assistant-and-inbox, CTX-NTE-20261021-m4-inbound-replies]
---

## Question investigated
What the module 4 code (main at f1029ac) already does and what it lacks against the cyclic AI plan.

## Findings
Full report: `docs/ai-gap-analysis.md`. Keep: deterministic-first rules, app-decides/AI-reads-and-writes with `validatePhrase`, masking and injection filter, call ceilings, idempotency, per-clinic scoping, offline evals and `/qualidade-ia`, and the `reminder` table as the single outbox.
Gaps (A = affects patients/operations now): L1 replies wait for the n8n `/due` poll (≤ ~70 s) [A]; L2 buffer via `setTimeout` in the route, no max wait, global scan [A]; L3 no per-number serialization [M]; L4 staff messages from the phone (`fromMe`) ignored, no human takeover [A]; L5 audio/media silently ignored [A]; L6 no message history for the AI [M]; L7 two AI paths and an if-ladder router [M]; L8 not cyclic (silent expiry, terminal handoff) [M]; L9 counts only, no per-turn trace or cost in money [M]; L10 no virtual-assistant disclosure [M]; L11 no pacing/delivery status/connection monitoring [M]; L12 autonomy only on/off [B]; L13 webhook secret in URL (internal traffic) [B].

## Implications
Plan's tactical part replaced by a migration roadmap: F1 transport (worker debounce + worker sender, n8n cut by switch, media notice), F2 state and memory (message log, human takeover, disclosure, delivery status), F3 unified turn pipeline with trace and money budget, F4 cycle (reschedule by chat, resume, return from handoff), F5 autonomy, F6 knowledge. Pending decisions: reuse `reminder` as outbox, message retention (90 d proposed), human-takeover silence (until release or 12 h), n8n cut by switch.
