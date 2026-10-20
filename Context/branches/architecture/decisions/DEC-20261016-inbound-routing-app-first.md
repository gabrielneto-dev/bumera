---
id: CTX-DEC-20261016-inbound-routing-app-first
type: decision
title: Mensagens do WhatsApp: passar primeiro pelo app e depois repassar ao n8n (a verificar na config do Evolution)
branch: architecture
tags: [whatsapp, webhook, evolution-api]
status: active
confidence: medium
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-DEC-20261016-three-engines]
---

# Decision
An inbound client message must be known to both the app and n8n. Because Evolution may send a webhook to only one URL per instance, the preferred design is **Evolution → app → n8n**: the app receives and records, then forwards what n8n needs. Some information may go directly to n8n or the app depending on need.

## Verify
What the Evolution API version actually supports (multiple webhooks/fan-out vs one URL) — not verified in this session. If fan-out is supported, the direct approach can be reconsidered.

## Consequences
The app needs a webhook receiver for Evolution and an authenticated forwarder to n8n (`CTX-QUE-20261016-service-auth`).
