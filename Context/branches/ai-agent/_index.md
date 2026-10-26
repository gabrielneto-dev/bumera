# Branch: ai-agent

**Current direction (2026-10-26): the WhatsApp conversation lives in n8n workflows; the app is only an API** — `CTX-DEC-20261026-whatsapp-in-n8n`, API reference `docs/n8n-whatsapp-api.md` (code: `lib/n8n-api/*`, routes `app/api/v1/clinics/**`). Everything below about in-app turns, worker and pg-boss is history (superseded).

Scope: the WhatsApp assistant — inbound channel, conversation state, agent turn, tools, guardrails, outbox/sender, memory, evaluation, autonomy. Status: active (plan approved 2026-10-25, Phase 0 started).

Full plan (canonical, long): `docs/ai-whatsapp-architecture.md` in the repo. Summary and phase tracking: `CTX-PLN-20261025-ai-whatsapp-architecture`.

## Key concepts
Three loops (turn · conversation · learning); conversation = append-only events + projected state (control `bot|human|blocked` × phase `idle|awaiting_patient|awaiting_staff`); seven-stage turn (perceive, understand, route, deliberate, verify, commit, reflect); model proposes commands, the system decides; outbox + single sender per WhatsApp number; autonomy ladder L0–L4 per clinic and action class.

## Decisions
- **WhatsApp in n8n, app as API** — `CTX-DEC-20261026-whatsapp-in-n8n` (supersedes the conversation-in-app decision)
- Port DeskcommCRM patterns, no fork — `CTX-DEC-20261025-port-deskcomm-patterns`
- Conversation owned by the app; n8n out of the conversation path — `CTX-DEC-20261025-conversation-owned-by-app` (supersedes `CTX-DEC-20261016-inbound-routing-app-first`)
- Deterministic channel before the LLM (closes M4) — `CTX-DEC-20261025-deterministic-channel-first`
- Single sender: reminders also leave through the worker outbox (n8n out of M3) — `CTX-DEC-20261025-single-sender-outbox`
- AI cost cap ≤ 30% of the clinic fee — `CTX-DEC-20261025-ai-cost-cap`
- Autonomy ladder and thresholds — `CTX-DEC-20261025-autonomy-ladder`
- Virtual-assistant disclosure in the first message — `CTX-DEC-20261025-assistant-disclosure`
- Migration roadmap F1–F6 and its 4 decisions (outbox = `reminder`, 90-day message retention, human takeover until release or 12 h, n8n cut by switch) — `CTX-DEC-20261025-migration-roadmap`
- Queue: pg-boss 12 in polling mode with heartbeat (spike evidence) — `CTX-DEC-20261025-queue-pg-boss`

## Research
`CTX-RES-20261025-deskcommcrm-agent-engine` (what to port, file pointers), `CTX-RES-20261025-evolution-webhook-contract` (docs-based contract, pin v2.3.7), `CTX-RES-20261025-module4-gap-analysis` (current code vs plan; new roadmap F1–F6).

## Code map
F1 worker pipeline (switch, turns, sender, media): `CTX-NTE-20261025-f1-worker-pipeline`.
Queue/worker foundation: `lib/queue/boss.ts` (pg-boss options), `lib/queue/queues.ts` (`defineQueue`, `enqueue`, `enqueueDebounced`, Prisma-transaction enqueue), `lib/queue/worker.ts` (`startWorker`, retries, heartbeat, per-group serialization), `lib/queue/health.ts`, `lib/log.ts` (JSON-lines, no PII), entry `worker/main.ts` (`npm run worker:dev`). **Run a single worker replica**: per-conversation serialization is in-memory (`localGroupConcurrency`) because pg-boss's database-wide `groupConcurrency` raced between pollers of one process (measured).

## Open questions (Phase 0)
`CTX-QUE-20261025-evolution-webhook-contract`.

## Answered
`CTX-QUE-20261025-queue-library` → pg-boss.

## Risks
Inherited: `CTX-RSK-20261014-whatsapp-unofficial-api`, `CTX-RSK-20261014-lgpd-patient-data`, `CTX-RSK-20261016-home-server-availability`.

Existing implementation to reconcile with: `CTX-NTE-20261021-m4-inbound-replies`, `CTX-NTE-20261024-ai-assistant-and-inbox`, `CTX-NTE-20261024-booking-dialog`, decisions `CTX-DEC-20261021-replies-via-reminder-pipeline`, `CTX-DEC-20261024-ai-booking-rules`.

Related: `../architecture/_index.md`, `../product/_index.md` (`CTX-QUE-20261016-llm-usage-in-pilot`).
