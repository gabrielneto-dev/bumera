---
id: CTX-DEC-20261025-deterministic-channel-first
type: decision
title: Canal determinístico (sem LLM) antes da IA — fecha o M4
branch: ai-agent
tags: [whatsapp, roadmap, ai-assistant]
status: active
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-PLN-20261017-mvp-milestones, CTX-QUE-20261016-llm-usage-in-pilot]
supersedes: null
superseded_by: null
---

# Decision
Phase 1 delivers inbound, conversation state, debounce, outbox/sender and rule replies ("1/confirmo", "2/remarcar", "SAIR") with no LLM. The LLM enters only in Phase 2, in shadow mode.

## Rationale
The queue, outbox and state machine are prerequisites for any LLM and already deliver the pilot's M4. Matches the earlier recommendation in `CTX-QUE-20261016-llm-usage-in-pilot`.

## Consequences
Rules always take precedence over the LLM later (principle "deterministic before probabilistic"). Approved by the user on 2026-10-25.
