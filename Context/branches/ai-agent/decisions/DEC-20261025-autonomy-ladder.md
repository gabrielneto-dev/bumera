---
id: CTX-DEC-20261025-autonomy-ladder
type: decision
title: Escada de autonomia L0–L4 por clínica e classe de ação, com limiares
branch: ai-agent
tags: [ai-assistant, security]
status: active
confidence: medium
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-PLN-20261025-ai-whatsapp-architecture]
supersedes: null
superseded_by: null
---

# Decision
Autonomy is set per clinic and per action class; new clinics start at L1.
- L0 off (rules only) → L1 shadow (suggests, never sends): promote at ≥ 100 turns and ≥ 80% suggestions rated "would send".
- L2 copilot (one-click send): promote at ≥ 200 sends, ≥ 90% approved unedited, 0 serious incidents.
- L3 autonomous replies, agenda actions as proposals: promote after 30 days with 0 serious incidents and stable handoff rate.
- L4 executes low-risk actions (confirm, opt-out, reschedule within rules); cancel stays a proposal.
A serious incident (wrong agenda action, message to opted-out patient, another patient's data) demotes one level immediately and raises an alert.

## Consequences
Thresholds are starting values, adjustable after the pilot. Approved by the user on 2026-10-25.
