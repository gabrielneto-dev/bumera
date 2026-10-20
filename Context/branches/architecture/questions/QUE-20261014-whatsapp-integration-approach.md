---
id: CTX-QUE-20261014-whatsapp-integration-approach
type: question
title: Evolution API como servidor separado ou integrada ao Next.js?
branch: architecture
tags: [whatsapp, evolution-api, webhook]
status: answered
created_at: 2026-10-14
updated_at: 2026-10-16
related: [CTX-ASM-20261014-stack-candidates, CTX-RSK-20261014-whatsapp-unofficial-api]
resolved_by: CTX-DEC-20261016-three-engines
---

## Question
Run an Evolution API server as the main WhatsApp API with webhooks, or integrate the messaging inside Next.js? Is the official WhatsApp Cloud API an alternative?

## How to resolve
Discussion; consider ban risk and cost (see risk record).

## Answer (2026-10-16)
Evolution API runs as a separate server using webhooks and API endpoints; connection, inbound messages and related info are handled in both n8n and the app. To study further. Routing details: `CTX-QUE-20261016-inbound-whatsapp-routing`. The official Cloud API alternative was not discussed and the unofficial-API risk stays open.
