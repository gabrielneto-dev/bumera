---
id: CTX-QUE-20261016-inbound-whatsapp-routing
type: question
title: Mensagem recebida: Evolution envia primeiro ao n8n ou ao app?
branch: architecture
tags: [whatsapp, webhook, evolution-api]
status: answered
created_at: 2026-10-16
updated_at: 2026-10-16
resolved_by: CTX-DEC-20261016-inbound-routing-app-first
---

## Question
Mensagem recebida: Evolution envia primeiro ao n8n ou ao app?

## Why this matters
The user said messaging is handled in both n8n and the app; the first hop must be defined.

## What depends on the answer
Flow design for the WhatsApp scheduling conversation.

## Known options
Evolution→n8n→app API (n8n owns conversation) vs Evolution→app→n8n vs fan-out to both.

## How to resolve
Answer in the questionnaire (user), then record a DEC and mark this answered.

## Answer (2026-10-16)
See `CTX-DEC-20261016-inbound-routing-app-first`.
