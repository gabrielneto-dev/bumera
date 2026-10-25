---
id: CTX-QUE-20261025-queue-library
type: question
title: Fila do worker — graphile-worker ou pg-boss?
branch: ai-agent
tags: [architecture, database]
status: answered
resolved_by: CTX-DEC-20261025-queue-pg-boss
created_at: 2026-10-25
updated_at: 2026-10-25
---

## Question
Which Postgres-backed job library runs the worker (turns, sender, follow-ups)?

## Why this matters
It provides debounce (replace a job's due time by key), per-conversation serialization, crash recovery and scheduling.

## How to resolve
Phase 0 spike (task 0.1): debounce by key, serialization per conversation, recovery after `kill -9`, coexistence with Prisma 7 and the shared `infra-postgres`.

## Answer (2026-10-25)
pg-boss 12.38 in polling mode — spike results in `CTX-DEC-20261025-queue-pg-boss`.
