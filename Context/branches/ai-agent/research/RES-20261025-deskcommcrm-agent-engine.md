---
id: CTX-RES-20261025-deskcommcrm-agent-engine
type: research
title: Avaliação do DeskcommCRM como referência para o motor de IA
branch: ai-agent
tags: [ai-assistant, whatsapp, architecture]
status: active
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-25
source_ids: []
---

## Question investigated
Is github.com/melgarafael/DeskcommCRM a good base for Bumera's WhatsApp AI?

## Scope & date
Shallow clone read on 2026-10-25 (last commit 2026-10-24). Not run.

## Findings
- MIT, ~4.8k stars, ~14.5k commits; Next.js 16 + Supabase (RLS, `event_log`), WAHA, Vercel AI SDK, Zod v3. Agent engine in `lib/agent-engine/`, workers in `workers/`.
- Too coupled to Supabase/WAHA/its CRM to fork; `agent/inbound-turn.ts` is 6.4k lines and `guardrails/before-send.ts` 1.9k (grown by incident patches).
- Patterns worth porting (paths under `lib/agent-engine/`): `queue/queue.ts` + `queue/loop.ts` (SKIP LOCKED, one lane per contact, dedup by source event, visibility timeout reaper, "sleep until next due job"); `INBOUND_DEBOUNCE_MS` 8 s burst coalescing and `RESPOSTA_OBSOLETA_TETO_MS` in `env.ts`; `agent/turno-ja-respondido.ts` (seen-watermark before reading context; stale/duplicate reply rules — learned from a real double reply); `guardrails/before-send.ts` (ordered pure gates, veto reason returned to the model, per-gate audit); `agent/compaction.ts` (flush durable notes before summarising); `agent/followup-turn.ts` (re-entry block with elapsed time and promise); `pacing/defaults.ts` (throttle + jitter, human delay per character, warm-up caps, send window); `lib/ai/handoff/triggers.ts` (pt-BR regex for "quero humano"); `flywheel/live.ts` (judge on real turns, human publishes changes).

## Limitations
Code read, not executed; behaviour claims come from code comments.

## Implications
Port patterns, not code (`CTX-DEC-20261025-port-deskcomm-patterns`). Bumera uses Zod v4 and Prisma, so nothing is copy-paste compatible anyway.
