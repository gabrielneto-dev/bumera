# Context Map

## Project
- Overview: `core/overview.md` · Goals: `core/goals.md` · Constraints: `core/constraints.md` · Glossary: `core/glossary.md`
- Current state: `STATE.md` · Memory manual: `README.md`

## Branches

### product
Path: `branches/product/` — Status: active
Tags: product-modules, pricing, pilot, roadmap, scheduling
Routes: modules/pricing/pilots/triggers/calendar/patients/roles → `branches/product/_index.md`

### architecture
Path: `branches/architecture/` — Status: active (direction decided)
Tags: stack, nextjs, n8n, evolution-api, whatsapp, database, hosting, infrastructure, auth, security, lgpd, multi-tenancy
Routes: stack/WhatsApp/data/compliance/server/code map → `branches/architecture/_index.md` (start with `CTX-NTE-20261020-m1-implementation` to find code)

### ai-agent
Path: `branches/ai-agent/` — Status: active (plan approved, being re-based on the merged module 4 code)
Tags: ai-assistant, whatsapp, llm, outbox, webhook, evolution-api
Routes: WhatsApp AI architecture, worker/queue (pg-boss), cyclic turns, autonomy → `branches/ai-agent/_index.md` (full plan: `docs/ai-whatsapp-architecture.md`)

## Global records
`global/questions/` (answered bootstrap questions); other `global/` folders empty. Sources: `sources/` (OpenRouter pricing articles).

## Other
Checkpoints: `checkpoints/` · Catalog (derived): `_meta/catalog.jsonl`
