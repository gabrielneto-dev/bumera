---
id: CTX-DEC-20261025-ai-cost-cap
type: decision
title: Teto de custo de IA por clínica — até 30% da mensalidade
branch: ai-agent
tags: [llm, pricing, ai-assistant]
status: active
confidence: medium
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-ASM-20261014-pricing-baseline, CTX-QUE-20261016-llm-usage-in-pilot]
supersedes: null
superseded_by: null
---

# Decision
LLM spend per clinic per month is capped at 30% of the clinic's fee (pilot at ~R$50 → ~R$15). Every model call passes a budget check first; when exhausted the clinic falls back to deterministic replies and gets a notice.

## Consequences
Cap is a per-clinic setting (fee may change). Real cost per turn is measured in Phase 2 with the chosen model; revisit if it does not fit. Approved by the user on 2026-10-25.
