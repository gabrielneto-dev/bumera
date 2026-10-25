---
id: CTX-DEC-20261025-migration-roadmap
type: decision
title: Roteiro F1–F6 de migração da IA e as 4 decisões (outbox, retenção, atendimento humano, corte do n8n)
branch: ai-agent
tags: [ai-assistant, whatsapp, roadmap, outbox, n8n, lgpd]
status: active
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-RES-20261025-module4-gap-analysis, CTX-PLN-20261025-ai-whatsapp-architecture, CTX-DEC-20261025-single-sender-outbox]
---

# Decision (approved by the user on 2026-10-25)
Roadmap of `docs/ai-gap-analysis.md` §5: F1 transport, F2 state and memory, F3 unified turn, F4 cycle, F5 autonomy, F6 knowledge; each phase ships on its own. Plus:
1. **Outbox = the existing `reminder` table** (replies and reminders); no `outbound_message` table.
2. **Message log retention (F2): 90 days of text**, then metadata only.
3. **Human takeover (F2):** a staff message from the clinic phone silences the bot until the secretary releases it or 12 h pass without a staff message.
4. **n8n cut (F1) by a switch** (`WHATSAPP_SENDER=worker|n8n`), never both sending; validate with the test number, then deactivate the n8n workflow.

## Consequences
F1 keeps `handleInboundMessage` and the reminder pipeline; only buffering, scheduling and sending move to the worker.
