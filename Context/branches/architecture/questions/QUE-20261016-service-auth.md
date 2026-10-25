---
id: CTX-QUE-20261016-service-auth
type: question
title: Como n8n, Evolution e app se autenticam entre si (chaves, assinatura de webhooks)?
branch: architecture
tags: [security, webhook, integration]
status: open
created_at: 2026-10-16
updated_at: 2026-10-21
---

## Question
Como n8n, Evolution e app se autenticam entre si (chaves, assinatura de webhooks)?

## Why this matters
The DB owner is the app; n8n calls its API and receives webhooks; endpoints are exposed from a home server.

## What depends on the answer
API security, webhook integrity. Secrets must live in env vars, never in Context/.

## Known options
API keys per service, HMAC-signed webhooks, network restriction.

## How to resolve
Answer in the questionnaire (user), then record a DEC and mark this answered.

## Partial answer (2026-10-17)
n8n is temporarily exposed (`CTX-DEC-20261017-network-exposure-phased`); service-to-service authentication (API keys, signed webhooks) is still to be defined.

## Partial answer (2026-10-21)
n8n -> app: Bearer `SERVICE_API_KEY` (env var; app answers 503 if unset, 401 if wrong). n8n -> Evolution: `apikey` header with `EVOLUTION_API_KEY`. Both calls stay on the internal docker network. Still open: signed (HMAC) inbound webhooks from Evolution to the app and the app -> n8n forwarder (M4); protection of the public n8n/Evolution hostnames (`CTX-RSK-20261021-evolution-publicly-exposed`).
