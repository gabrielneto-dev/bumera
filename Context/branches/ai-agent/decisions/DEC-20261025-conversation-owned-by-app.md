---
id: CTX-DEC-20261025-conversation-owned-by-app
type: decision
title: A conversa no WhatsApp é 100% do app (Evolution → app → worker → Evolution)
branch: ai-agent
tags: [whatsapp, evolution-api, n8n, architecture, webhook]
status: superseded
confidence: high
created_at: 2026-10-25
updated_at: 2026-10-26
related: [CTX-DEC-20261016-three-engines]
supersedes: CTX-DEC-20261016-inbound-routing-app-first
superseded_by: CTX-DEC-20261026-whatsapp-in-n8n
---

# Decision
Evolution sends its webhook to the app only. The app records and enqueues; a worker process (same repo, own compose service) runs turns and sends through the Evolution adapter. n8n is not on the conversation path; it stays for auxiliary automations only.

## Rationale
Conversation state, guardrails, pacing and audit need one owner and one transaction boundary; splitting them across n8n flows was the weak point (buffer/webhook problems).

## Consequences
New webhook route, worker service and Evolution adapter in the app. Approved by the user on 2026-10-25.

## Superseded (2026-10-26)
The conversation moved to n8n workflows; the app is only an API.
