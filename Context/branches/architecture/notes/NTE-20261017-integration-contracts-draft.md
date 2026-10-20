---
id: CTX-NTE-20261017-integration-contracts-draft
type: note
title: Rascunho dos contratos entre app, n8n e Evolution
branch: architecture
tags: [webhook, integration, api, security, whatsapp]
status: candidate
confidence: medium
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-NTE-20261017-data-model-draft, CTX-DEC-20261016-three-engines, CTX-DEC-20261016-inbound-routing-app-first]
---

# Integration contracts draft (awaiting user review)

```
Evolution --(inbound msg)--> App --(forward)--> n8n --(send via Evolution)--> WhatsApp
App worker --(trigger webhook)--> n8n          n8n --(REST, service key)--> App
```
(Routing per `CTX-DEC-20261016-inbound-routing-app-first`; verify Evolution's webhook capabilities.)

## 1. App → n8n: trigger webhook
`POST <n8n>/webhook/bumera-trigger`
Headers: `X-Bumera-Timestamp`, `X-Bumera-Event-Id` (idempotency key), `X-Bumera-Signature: sha256=HMAC(secret, timestamp + "." + body)`. n8n verifies the signature, rejects old timestamps, and ignores an event id it already processed.
Body (minimal PII: first name and phone, no CPF):
```
{ event_id, event_type, fire_at, attempt,
  clinic:{id,name,timezone}, patient:{id,first_name,phone},
  appointment:{id,starts_at,dentist_name,procedure_name} | null,
  template_key }
```
Event types: `appointment.created`, `appointment.reminder_24h`, `appointment.reminder_2h`, `appointment.no_show`, `patient.reactivation`, `quote.followup`, `whatsapp.message.received`.
n8n answers 2xx as soon as it accepts the event (state `handed_off`); the final delivery result comes back via the callback below. Non-2xx/timeout means retry.

## 2. Evolution → App: inbound
`POST /api/webhooks/evolution/<instance-token>`: verify the token, resolve the clinic by instance, record in message_log, match the patient by phone.
The app handles opt-out keywords ("SAIR") deterministically before forwarding (sets do_not_contact; no forward). Everything else is forwarded to n8n as `whatsapp.message.received`, including matched patient context.

## 3. n8n → App: REST API (`/api/v1`, bearer service key, `Idempotency-Key` on POST)
| Call | Purpose |
|---|---|
| GET clinics/{id}/availability?dentist_id&procedure_id&from&to | free slots |
| GET clinics/{id}/patients/lookup?phone= | find patient |
| POST clinics/{id}/patients | create pending patient; duplicate CPF returns 409 and raises a secretary alert |
| POST clinics/{id}/appointments | create pending appointment |
| PATCH appointments/{id} | action: confirm, cancel, request_reschedule |
| POST messages/events | delivery status (sent, delivered, failed, read) so message_log and scheduled_triggers are updated |
| POST patients/{id}/opt-out | opt-out found by a flow |

Response envelope: `{ success, data, error, meta }`. Errors never leak internals. Rate limiting and input validation with a schema library on every endpoint.

## 4. Security
- Secrets (HMAC key, service keys, Evolution token, CPF key) only in environment variables / secret manager, never in Context.
- Service keys scoped and rotatable; webhook secrets distinct per direction.
- n8n currently exposed (`CTX-DEC-20261017-network-exposure-phased`): until protected, signature checks and strong n8n authentication are the minimum.

## Module 3 (confirmação/lembrete) first flow
Trigger webhook → verify → build message from template → send via Evolution → POST messages/events. Patient replies "1 confirmar / 2 remarcar" → inbound → app → n8n → PATCH appointment.

## Adjustment 2026-10-17
`CTX-DEC-20261017-mvp-simplified`: section 1 (signed trigger webhook) is replaced by n8n polling `GET /api/v1/reminders/due` and `POST /api/v1/reminders/{id}/result`. Sections 2 and 3 (inbound routing and REST API) stand; HMAC signing between app and n8n is deferred.
