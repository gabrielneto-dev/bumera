---
id: CTX-CP-20261016-1917-architecture-and-pilot-answers
type: checkpoint
title: Arquitetura de três motores, hospedagem, piloto e backlog de perguntas
branch: global
tags: [architecture, pilot]
status: active
created_at: 2026-10-16
updated_at: 2026-10-16
---

# Session Checkpoint

## Objective
Persist the user's architecture description and answers to open questions; create a question backlog for iterative questionnaire sessions.

## What changed
Decisions: three engines, single DB owner, stack, home-server hosting, webhook triggers. Answered: stack-final, whatsapp-integration-approach, pilot-definition, clinic-data-source. Superseded: stack-candidates assumption. New risk: home server. 13 new open questions (QUE-20261016-*).

## Discoveries
- Pilot: 1–3 clinics, ~R$50/month, feedback-based success.
- Potential inconsistency: pilot fee covers "AI cost" but AI is planned last (`CTX-QUE-20261016-llm-usage-in-pilot`).
- `AGENTS.md` evaluated: no new operating rule (architecture belongs in Context).

## Current state
No code. Architecture direction defined; many details open.

## Open questions
All `CTX-QUE-20261016-*`.

## Next steps
Continue the questionnaire, then data model + API contracts, then project skeleton.

## Update (questionnaire round 1)
Answered: multi-tenancy (SaaS), database (PostgreSQL), inbound routing (app first, verify Evolution), pilot first module (confirmação/lembrete). Decisions recorded as DEC-20261016-*.
