---
id: CTX-ASM-20261014-stack-candidates
type: assumption
title: Stack candidata — Node.js + Next.js, n8n via webhook, banco compartilhado, Evolution API
branch: architecture
tags: [stack, nodejs, nextjs, n8n, evolution-api, database]
status: superseded
confidence: low
created_at: 2026-10-14
updated_at: 2026-10-16
related: [CTX-QUE-20261014-stack-final, CTX-QUE-20261014-whatsapp-integration-approach]
superseded_by: CTX-DEC-20261016-stack-nextjs-n8n
---

# Assumption

## Assumption
User considers: Node.js + Next.js (interface/communication), possibly n8n for flows (webhook communication), a shared database as common storage, and an Evolution API server as the main WhatsApp API using webhooks. All explicitly "to be discussed" — not decided.

## What depends on it
Everything in implementation.

## How to validate
Compare options against cost/simplicity constraints; prototype module 3.

## Consequence if false
Re-plan integrations; no code exists yet.

Superseded 2026-10-16: n8n, Next.js+Tailwind+shadcn/ui, Evolution as separate server and single DB owner were decided. See `CTX-DEC-20261016-three-engines`, `CTX-DEC-20261016-stack-nextjs-n8n`, `CTX-DEC-20261016-single-db-owner`.
