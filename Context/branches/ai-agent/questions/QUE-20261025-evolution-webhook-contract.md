---
id: CTX-QUE-20261025-evolution-webhook-contract
type: question
title: Contrato do webhook do Evolution (eventos, autenticação, eco de fromMe, presença)
branch: ai-agent
tags: [evolution-api, webhook, whatsapp]
status: open
created_at: 2026-10-25
updated_at: 2026-10-25
---

## Question
For the Evolution version we will install: which events arrive (message upsert/update, connection, presence "composing"), how the webhook is authenticated, single URL vs per event, and how our own sends echo back as `fromMe`.

## Why this matters
Defines the webhook schema, dedup key, staff-message detection and adaptive debounce.

## How to resolve
Phase 0 task 0.2: read the official docs for the chosen version, then capture real (anonymised) payloads into `tests/fixtures/evolution/` from the running instance. Correction: Evolution v2.3.7 is already deployed in `~/bumera-app` with test instance `bumera-teste` paired, and an app webhook exists (secret in the URL, `CTX-NTE-20261021-m4-inbound-replies`); start from that code.
