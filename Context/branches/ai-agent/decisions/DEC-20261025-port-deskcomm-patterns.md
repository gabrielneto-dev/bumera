---
id: CTX-DEC-20261025-port-deskcomm-patterns
type: decision
title: Portar padrões do DeskcommCRM para o motor de IA, sem fork
branch: ai-agent
tags: [ai-assistant, architecture]
status: active
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-RES-20261025-deskcommcrm-agent-engine]
supersedes: null
superseded_by: null
---

# Decision
Use DeskcommCRM as an engineering reference only: re-implement its proven patterns (queue lanes, debounce, stale-reply guard, ordered send gates, compaction, follow-up re-entry, pacing) in Bumera's stack. No fork, no copied modules.

## Rationale
Its engine depends on Supabase, WAHA and a large CRM; key files are thousands of lines. Bumera runs Prisma + Evolution + its own Postgres and keeps files at 200–400 lines.

## Consequences
Use off-the-shelf pieces where possible (queue library, Vercel AI SDK) and build only the domain core. Approved by the user on 2026-10-25.
