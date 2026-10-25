# Branch: ai-agent

⚠ Plan written before the n8n-control work was merged; being re-based (see the plan's correction).

Scope: the WhatsApp assistant — inbound channel, conversation state, agent turn, tools, guardrails, outbox/sender, memory, evaluation, autonomy. Status: active (plan approved 2026-10-25, Phase 0 started).

Full plan (canonical, long): `docs/ai-whatsapp-architecture.md` in the repo. Summary and phase tracking: `CTX-PLN-20261025-ai-whatsapp-architecture`.

## Key concepts
Three loops (turn · conversation · learning); conversation = append-only events + projected state (control `bot|human|blocked` × phase `idle|awaiting_patient|awaiting_staff`); seven-stage turn (perceive, understand, route, deliberate, verify, commit, reflect); model proposes commands, the system decides; outbox + single sender per WhatsApp number; autonomy ladder L0–L4 per clinic and action class.

## Decisions
- Port DeskcommCRM patterns, no fork — `CTX-DEC-20261025-port-deskcomm-patterns`
- Conversation owned by the app; n8n out of the conversation path — `CTX-DEC-20261025-conversation-owned-by-app` (supersedes `CTX-DEC-20261016-inbound-routing-app-first`)
- Deterministic channel before the LLM (closes M4) — `CTX-DEC-20261025-deterministic-channel-first`
- Single sender: reminders also leave through the worker outbox (n8n out of M3) — `CTX-DEC-20261025-single-sender-outbox`
- AI cost cap ≤ 30% of the clinic fee — `CTX-DEC-20261025-ai-cost-cap`
- Autonomy ladder and thresholds — `CTX-DEC-20261025-autonomy-ladder`
- Virtual-assistant disclosure in the first message — `CTX-DEC-20261025-assistant-disclosure`
- Queue: pg-boss 12 in polling mode with heartbeat (spike evidence) — `CTX-DEC-20261025-queue-pg-boss`

## Research
`CTX-RES-20261025-deskcommcrm-agent-engine` (what to port, file pointers), `CTX-RES-20261025-evolution-webhook-contract` (docs-based contract, pin v2.3.7).

## Code map
Queue/worker foundation: `lib/queue/boss.ts` (pg-boss options), `lib/queue/queues.ts` (`defineQueue`, `enqueue`, `enqueueDebounced`, Prisma-transaction enqueue), `lib/queue/worker.ts` (`startWorker`, retries, heartbeat, per-group serialization), `lib/queue/health.ts`, `lib/log.ts` (JSON-lines, no PII), entry `worker/main.ts` (`npm run worker:dev`). **Run a single worker replica**: per-conversation serialization is in-memory (`localGroupConcurrency`) because pg-boss's database-wide `groupConcurrency` raced between pollers of one process (measured).

## Open questions (Phase 0)
`CTX-QUE-20261025-evolution-webhook-contract`.

## Answered
`CTX-QUE-20261025-queue-library` → pg-boss.

## Risks
Inherited: `CTX-RSK-20261014-whatsapp-unofficial-api`, `CTX-RSK-20261014-lgpd-patient-data`, `CTX-RSK-20261016-home-server-availability`.

Existing implementation to reconcile with: `CTX-NTE-20261021-m4-inbound-replies`, `CTX-NTE-20261024-ai-assistant-and-inbox`, `CTX-NTE-20261024-booking-dialog`, decisions `CTX-DEC-20261021-replies-via-reminder-pipeline`, `CTX-DEC-20261024-ai-booking-rules`.

Related: `../architecture/_index.md`, `../product/_index.md` (`CTX-QUE-20261016-llm-usage-in-pilot`).
