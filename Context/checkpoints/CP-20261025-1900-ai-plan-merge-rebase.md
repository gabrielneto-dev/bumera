---
id: CTX-CP-20261025-1900-ai-plan-merge-rebase
type: checkpoint
title: Plano de IA cíclica aprovado, worker pg-boss, merge do n8n-control no main e re-base do plano
status: active
created_at: 2026-10-25
updated_at: 2026-10-25
tags: [ai-assistant, whatsapp, architecture, roadmap]
---

# Session Checkpoint

## Objective
Redesign the WhatsApp AI (processing, webhook, buffer, data retrieval, replies) as a cyclic system, using github.com/melgarafael/DeskcommCRM as reference, then execute.

## What changed
- Approved plan `docs/ai-whatsapp-architecture.md` + context branch `ai-agent` (7 approved decisions, DeskcommCRM research, Evolution contract research).
- Phase 0: queue spike chose pg-boss (`CTX-DEC-20261025-queue-pg-boss`); worker foundation `lib/queue/*`, `lib/log.ts`, `worker/main.ts`.
- Branch `claude/n8n-control-6b3b95` (44 commits: M3 deploy, M4 replies, modules 1, 2, 4 AI) merged into `main` at f1029ac at the user's request; conflicts only in Context, `AGENTS.md`, `package.json` (both sides kept). Verified: typecheck, lint, 789 tests.
- New branch `claude/ai-cyclic-architecture` from that `main`, carrying the plan, the ai-agent context and the worker foundation. The earlier branch `claude/whatsapp-ai-architecture-0357e3` is obsolete.

## Discoveries
- The plan was first written from `main` without the n8n-control work, so it assumed no AI/webhook/buffer code existed. The real current pipeline: Evolution webhook → app (secret in URL) → `inbound_buffer` (8 s) flushed by the n8n `/due` poll every minute → replies through the reminders pipeline; module 4 AI (claude-haiku-5.5, booking dialog) runs inside that flow.
- Worktrees share `bumera_test` and `bumera_dev`: a migration from one branch can collide with tables of another. A Phase 1 draft migration did (table `conversation`); it was rolled back on both databases and parked in the session scratchpad.
- pg-boss gotchas (deferred jobs + LISTEN/NOTIFY, supervise interval, group concurrency race): see the queue decision.

## Failed approaches worth remembering
- Starting from `main` without checking other worktrees/branches (`git worktree list`, `git branch -a`) — check them before planning on this project.

## Current state
Plan approved but being re-based; worker foundation present but consumes no queue yet.

## Next steps
1. Gap analysis: module 4 code and `inbound_buffer`/`/due` flow vs the plan.
2. Rewrite phases 1+ as an incremental replacement (first: buffer flush and replies moved from the n8n poll to worker jobs).
3. Capture real Evolution payloads from `bumera-teste` into fixtures.

## Context records created or updated
Created: `branches/ai-agent/**`, this checkpoint. Updated: MAP, STATE, architecture index, `CTX-DEC-20261016-inbound-routing-app-first` (superseded), changelog, catalog.
