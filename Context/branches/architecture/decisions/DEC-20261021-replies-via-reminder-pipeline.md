---
id: CTX-DEC-20261021-replies-via-reminder-pipeline
type: decision
title: Respostas automáticas ao paciente reaproveitam a tabela reminder e o fluxo n8n (tipos REPLY_*)
branch: architecture
tags: [whatsapp, n8n, architecture]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261021-m4-inbound-replies, CTX-DEC-20261017-mvp-simplified]
---

# Decision
Answers to a patient's reply (1, 2, SAIR) are rows of `reminder` with kinds `REPLY_CONFIRMED`, `REPLY_RESCHEDULE`, `REPLY_OPTED_OUT`, handed to n8n through the existing `GET /due` and `POST /result`, instead of a second outbound table or the app calling Evolution directly.
## Why
Keeps one delivery path with retries, claim/lease, attempt checks and the Pendentes failure list; the workflow needs no change; the unique `(appointmentId, kind)` gives one reply per appointment and absorbs repeated webhooks; n8n stays the only component that sends WhatsApp messages.
## Consequences
Replies need an appointment to attach to (an opt-out of a patient without appointments gets no acknowledgement). `syncReminders` only manages the four planned kinds. Revisit if replies are needed without appointments (e.g. new-patient flows in M5).
