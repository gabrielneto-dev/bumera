---
id: CTX-PLN-20261025-ai-whatsapp-architecture
type: plan
title: Arquitetura e roadmap da IA no WhatsApp (Fases 0–6)
branch: ai-agent
tags: [ai-assistant, whatsapp, architecture, roadmap, llm]
status: in-progress
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-PLN-20261017-mvp-milestones, CTX-RES-20261025-deskcommcrm-agent-engine]
depends_on: [CTX-DEC-20261025-port-deskcomm-patterns, CTX-DEC-20261025-conversation-owned-by-app, CTX-DEC-20261025-deterministic-channel-first, CTX-DEC-20261025-single-sender-outbox]
---

# ⚠ Correction (2026-10-25, later the same day)
This plan was written from `main`, which lacked 44 commits of branch `claude/n8n-control-6b3b95` (worktree `.claude/worktrees/n8n-control-6b3b95`): M3 deployed (`~/bumera-app`, Evolution v2.3.7 paired, n8n workflow), M4 inbound replies, modules 1–2, clinic settings, quiet hours/daily limit, WhatsApp instance per clinic, LGPD, and module 4 AI (inbox, opt-in assistant with claude-haiku-5.5, booking dialog, `inbound_buffer` flushed by the n8n `/due` poll, AI quality screen). The premise "no AI/webhook/buffer code exists" was wrong. Phase 1 was stopped; the plan must be re-based as a migration of that implementation. On 2026-10-25 that branch was merged into `main` (merge commit f1029ac) and work continues on branch `claude/ai-cyclic-architecture`. **Next: gap analysis** of the module 4 code (`CTX-NTE-20261024-ai-assistant-and-inbox`, `CTX-NTE-20261024-booking-dialog`, `CTX-NTE-20261021-m4-inbound-replies`, `inbound_buffer` flushed by the n8n `/due` poll) against this plan, then rewrite phases 1+ as an incremental replacement. Never apply a migration to the shared `bumera_test`/`bumera_dev` that creates tables other branches own (a draft did, and was rolled back on both).

# Plan (approved 2026-10-25)
Canonical text: `docs/ai-whatsapp-architecture.md` (strategy, architecture, tactical plan). This record tracks phases and progress; read the doc before building.

## Phases
| Phase | Scope | Autonomy |
|---|---|---|
| 0 Foundation | queue spike, Evolution contract, worker skeleton in compose | — |
| 1 Deterministic channel (closes M4) | conversation models, webhook, debounce, outbox + sender with pacing, reminders through sender, rule replies (1/2/SAIR), conversations screen | L0 |
| 2 Shadow brain | `lib/llm` gateway + budget + cassettes, stages 1–5 read-only, gates, traces, suggestion UI, ≥ 40 pt-BR scenarios, model choice | L1 |
| 3 Copilot | one-click send, autonomy policy + breaker, commands as proposals, handoff | L2→L3 |
| 4 Proactive cycle | follow-ups, appointment-change and no-show triggers, reflection/compaction, audio | L3→L4 |
| 5 Learning | nightly judge, playbook proposals, clinic dashboard | — |
| 6 Knowledge & growth | pgvector KB, waitlist, reactivation | — |

## Impact on the MVP plan
M3 no longer uses an n8n flow: reminders are sent by the worker outbox (`CTX-DEC-20261025-single-sender-outbox`). M4 becomes Phase 1.

## Progress
- 2026-10-25: plan approved with all pending decisions; Phase 0 started.
- 2026-10-25: 0.1 done — pg-boss chosen (`CTX-DEC-20261025-queue-pg-boss`).
- 2026-10-25: 0.2 docs part done (`CTX-RES-20261025-evolution-webhook-contract`, pin Evolution v2.3.7); real payload capture waits for Evolution on the server.
- 2026-10-25: 0.3 done in code — `lib/queue/{boss,queues,worker,health}.ts`, `lib/log.ts`, `worker/{main,queues}.ts`, scripts `worker`/`worker:dev`, tests in `tests/queue/`. Compose service/Dockerfile wait for `CTX-QUE-20261018-app-deployment`.
- 2026-10-25: gap analysis done (`CTX-RES-20261025-module4-gap-analysis`, `docs/ai-gap-analysis.md`); the phase table above is replaced by its roadmap F1–F6 once the user approves.
