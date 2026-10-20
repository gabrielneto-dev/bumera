---
id: CTX-DEC-20261016-three-engines
type: decision
title: Arquitetura de três motores: app Next.js (front+back no mesmo projeto), n8n e Evolution API
branch: architecture
tags: [architecture, nextjs, n8n, evolution-api]
status: active
confidence: high
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-DEC-20261016-single-db-owner, CTX-DEC-20261016-stack-nextjs-n8n, CTX-DEC-20261016-webhook-triggers]
---

# Decision

## Context
Bumera = dental-clinic scheduling system plus WhatsApp automation.

## Decision
Three engines:
1. **App engine** — one Next.js project containing front end AND back end (no separate front/back servers). Back end exposes API endpoints and fires outbound webhooks. It is internally a dental-clinic scheduling system: calendar control, scheduling API, patient registration, patient identification data.
2. **n8n engine** — owns the WhatsApp scheduling conversation (the largest area) and the follow-up/reactivation/reminder flows. Talks to the app via webhooks and API.
3. **Evolution API** — separate server for WhatsApp connectivity; uses webhooks and API endpoints. Messaging integration is handled both in n8n and in the app.

## Rationale
User-stated: keep front/back together in one project; delegate WhatsApp flows to n8n; structure incrementally over time.

## Consequences
Contracts between the three (webhook payloads, API auth) must be defined early. See open questions on routing and service auth.
