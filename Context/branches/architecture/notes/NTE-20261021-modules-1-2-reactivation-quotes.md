---
id: CTX-NTE-20261021-modules-1-2-reactivation-quotes
type: note
title: Módulos 1 (reativação) e 2 (orçamentos): mapa do código, regras e operação
branch: architecture
tags: [architecture, product-modules, whatsapp, n8n, triggers]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261021-m4-inbound-replies, CTX-DEC-20261021-reactivation-and-quotes-rules, CTX-DEC-20261021-replies-via-reminder-pipeline]
---

# Modules 1 and 2 (commits 1955575, 3816981; migrations m5_reactivation, m5_quotes)

## Data model
- `procedure.reactivateAfterMonths` (1..60, null = never, DB CHECK). `reminder` gained `answer` (INTERESTED/DECLINED), `answeredAt`, `handledAt`.
- `quote` (tenant table, registered in `TENANT_MODELS`): patient, `description` (<= 200), `valueCents` (<= R$ 99.999,99, internal only, never sent to the patient), status OPEN/ACCEPTED/DECLINED, `closedAt`.
- `reminder` now belongs to an appointment OR a quote: `appointmentId` is nullable, `quoteId` added, composite FKs on both, CHECK "exactly one", unique (appointmentId, kind) and (quoteId, kind). New kinds: `REACTIVATION`, `QUOTE_FOLLOWUP_1/2`, `REPLY_INTERESTED`, `REPLY_DECLINED` (replies are shared by both campaigns).

## Module 1: reactivation
`planReminders`: a COMPLETED appointment whose procedure has a period gets a `REACTIVATION` due `endsAt + N months` (date-fns `addMonths`, clamps month ends). Guard: cancelled if the appointment is no longer completed or the patient already has a live upcoming appointment; opt-out and consent apply. Message has no "N months": it says it has been a while since the procedure and offers *1* schedule / *2* not now. The appointments service passes the procedure's period to `syncReminders`.

## Module 2: quotes
`lib/services/quotes.ts` (`createQuote`, `changeQuoteStatus`, `listQuotes`), screen `/orcamentos` (menu "Orçamentos", roles admin and secretary: create/read/update; dentist none). `planQuoteReminders`: follow-ups at +2 and +7 days from creation, only while OPEN and within 14 days (`QUOTE_VALID_DAYS`); `syncQuoteReminders` creates them and cancels the unsent ones when the quote is closed. `evaluateQuoteGuard` cancels follow-ups of closed/expired quotes at claim time. An open quote older than 14 days is shown as "Expirado" (computed, not stored).

## Replies (inbound)
`openCampaignMessage`: the latest SENT message to the patient (not counting replies) decides the meaning of "1/2": if it is a campaign message (reactivation or quote follow-up), unanswered and under 14 days old, "1" = interested, "2" = not now; appointment reminders sent after it win. Interested -> `reminder.answer`, automatic `REPLY_INTERESTED`, listed on Pendentes ("Querem falar com a equipe") until a secretary clicks "Marcar como atendido". Not now -> `REPLY_DECLINED`; for a quote it also closes the quote as DECLINED and stops its follow-ups. SAIR skips pending quote/appointment reminders and the acknowledgement attaches to the latest appointment, else the latest quote.

## n8n
Unchanged workflow. `GET /due` items now carry `appointment: null` and `quote: {id, description}` for quote items; the workflow only uses id, attempt, message and patient phone.

## Operation and tests
- Verified on 2026-10-21 with the owner's phone: quote created in the UI, follow-up 1 sent, reply 1 recorded and answered, Pendentes list and "Marcar como atendido" worked. Reactivation was verified only by automated tests (no real WhatsApp run yet).
- To exercise a campaign quickly, bring a PENDING reminder's `dueAt` to now with SQL on `bumera_prod` (needs the owner's Bash permission rule; test data only). Take a `~/bumera-app/backup.sh` backup before migrations.
- 379 tests, ~96% statements.
