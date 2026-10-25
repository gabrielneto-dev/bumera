---
id: CTX-DEC-20261025-queue-pg-boss
type: decision
title: Fila do worker — pg-boss 12 em modo polling, com heartbeat
branch: ai-agent
tags: [architecture, database]
status: active
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-QUE-20261025-queue-library, CTX-PLN-20261025-ai-whatsapp-architecture]
supersedes: null
superseded_by: null
---

# Decision
Use **pg-boss 12.38** (own schema in the app database) for turns, sender, follow-ups and scheduled tasks. Agent-chosen in Phase 0 from a measured spike (the plan delegated the pick to the spike).

## Evidence (spike 2026-10-25 against `bumera_test`, both libraries)
| Scenario | graphile-worker 0.18.0 | pg-boss 12.38.0 |
|---|---|---|
| Debounce: 5 msgs in 2 s, 3 s window → 1 run | pass (`jobKey` + `replace`, array payloads merged) | pass with `upsert(singletonKey, startAfter)`; payload is replaced (last wins) |
| Serialize per conversation | pass (`queueName` per conversation) | pass (`group: {id}` + `groupConcurrency: 1`) |
| Worker `kill -9` mid-job | **fail**: job stays locked; only `forceUnlockWorkers` or lock expiry frees it | pass: retried automatically (`heartbeatSeconds` + supervise) |
| Latency after due | ~20 ms | ≤ 500 ms (polling interval) |
| Enqueue inside the Prisma transaction | raw SQL `add_job` | official adapter `fromPrisma(tx)` |

## Gotchas found
- With `useListenNotify: true`, a job deferred with `startAfter` (the debounce case) was not picked up when due. Use polling (`pollingIntervalSeconds` 0.5–1); latency is irrelevant next to a multi-second debounce.
- Heartbeat recovery happens on the supervise cycle (default 60 s). Set `superviseIntervalSeconds` (5 s in the spike) and `heartbeatSeconds` ≥ 10 on the queue.
- `upsert` only edits pre-active jobs; while a turn runs, a new message creates a new job, which `groupConcurrency: 1` holds until the running one ends. Job payload carries only ids; turns read messages from the database.

## Consequences
Dependency `pg-boss@12.38.x`; its schema lives in each app database (`bumera_dev`, `bumera_test`, prod). Test helpers must reset that schema too.
