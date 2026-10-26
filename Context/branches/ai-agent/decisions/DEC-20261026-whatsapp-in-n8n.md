---
id: CTX-DEC-20261026-whatsapp-in-n8n
type: decision
title: Conversa do WhatsApp nos workflows do n8n; o app vira só API (código de conversa, IA e worker removidos)
branch: ai-agent
tags: [whatsapp, n8n, ai-assistant, architecture, api]
status: active
confidence: high
created_at: 2026-10-26
updated_at: 2026-10-26
related: [CTX-DEC-20261016-three-engines]
supersedes: CTX-DEC-20261025-conversation-owned-by-app
superseded_by: null
---

# Decision (user, 2026-10-26)
Everything WhatsApp lives in n8n: workflows talk to patients through Evolution (inbound, replies, booking dialog, AI). The app keeps the agenda, the reminder rules (`/api/v1/reminders/due` + `/result`) and an API for the workflows (`docs/n8n-whatsapp-api.md`: clinic by instance, contact, answers, procedures, slots, booking requests). Choices made with the user: cut immediately; drop the conversation tables and data; the AI lives in n8n.

## Removed from the app
Evolution webhook, inbound buffer, booking dialog, free-text AI, OpenRouter client and clinic AI key, worker/pg-boss pipeline (F1), Assistente and Qualidade da IA screens, Pendentes sections "Mensagens para responder"/"Conversas em andamento", "Limpar conversa", automatic-reply reminder kinds (`REPLY_*`), tables `conversation`, `inbound_message`, `inbound_buffer`, `ai_event`, schema `pgboss` (migration `20261026120000_whatsapp_moves_to_n8n`).

## Kept
Clinic ↔ instance mapping and the clinic's information text (WhatsApp screen), `bookingEnabled` (Mensagens screen), reminder/campaign/quote rules, answer logic (confirm, reschedule, opt-out, campaign) now in `lib/n8n-api/answers.ts`, free-slot search (`lib/schedule-slots.ts`), booking request with dependents (`lib/n8n-api/booking.ts`).

## Consequences
- Until the inbound workflow exists, patients' replies (including SAIR) are not processed: build it first (LGPD).
- The Evolution webhook of each instance must point at the n8n inbound workflow.
- Plan decisions about in-app turns, worker and pg-boss are superseded; principles (deterministic before AI, AI never decides facts, one sender per number, cost cap, disclosure) carry over to the workflows.
