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
App <- n8n: M2 implemented a Bearer `SERVICE_API_KEY` for `/api/v1/reminders/*` (constant-time check, uniform envelope, per-request env read); see `CTX-NTE-20261021-m2-implementation` and residual risks in `CTX-RSK-20261021-service-key-and-claim-races`. Still open: Evolution -> app inbound authentication (M4), signed app -> n8n webhooks (deferred), key rotation.
