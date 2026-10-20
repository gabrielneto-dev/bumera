---
id: CTX-NTE-20261017-data-model-draft
type: note
title: Rascunho do modelo de dados (PostgreSQL, multi-tenant)
branch: architecture
tags: [database, multi-tenancy, triggers, patient, calendar]
status: candidate
confidence: medium
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261016-three-engines, CTX-NTE-20261017-integration-contracts-draft]
---

# Data model draft (awaiting user review)

Principles: PostgreSQL owned only by the app (`CTX-DEC-20261016-postgresql`, `CTX-DEC-20261016-single-db-owner`). Every business table has `clinic_id`; tenant isolation enforced in the app and as defense in depth with Row-Level Security. Timestamps are `timestamptz`; the clinic timezone (default America/Sao_Paulo) is used to compute reminders. n8n keeps its own internal database separate from this one.

## Tables
| Table | Key fields | Notes |
|---|---|---|
| clinics | id, name, slug, timezone, whatsapp_instance, status | tenant root |
| users | id, email, name, auth fields (managed by the auth library) | login |
| memberships | user_id, clinic_id, role (admin, secretary, dentist) | `CTX-DEC-20261017-roles` |
| invitations | clinic_id, email, role, token_hash, expires_at, accepted_at | admin invites team |
| dentists | id, clinic_id, user_id (nullable), name, active | 1..N per clinic |
| availability_rules | dentist_id, weekday, start_time, end_time | working hours; details from pilot clinics |
| procedures | id, clinic_id, name, default_duration_min, active | clinic catalog |
| patients | id, clinic_id, name, cpf (encrypted), cpf_hash, phone_e164, birth_date, status (pending/confirmed), source (secretary/whatsapp), consent_at, consent_source, do_not_contact, opted_out_at | unique (clinic_id, cpf_hash) where cpf is not null |
| appointments | id, clinic_id, patient_id, dentist_id, procedure_id, starts_at, ends_at, status (pending, scheduled, confirmed, completed, cancelled, no_show), source, created_by | no overlap per dentist via an exclusion constraint (btree_gist) |
| quotes | id, clinic_id, patient_id, status (open, accepted, declined, expired), sent_at | needed for module 2 (later phase) |
| trigger_rules | id, clinic_id, event_type, offset, enabled, template_key | seeded with `CTX-DEC-20261017-default-trigger-timings` |
| scheduled_triggers | id, clinic_id, rule_id, subject_type, subject_id, fire_at, status (pending, handed_off, sent, failed, cancelled, skipped), attempts, next_attempt_at, last_error, idempotency_key (unique) | transactional outbox |
| message_log | id, clinic_id, patient_id, direction, wa_message_id, template_key, status, created_at | minimal content stored (health-adjacent data) |
| service_clients | id, name, key_hash, scopes | credentials for n8n; only hash stored |
| audit_log | id, clinic_id, actor, action, entity, entity_id, at | who changed what |

## Rules
- Duplicates: `CTX-DEC-20261017-patient-duplicate-rules`. WhatsApp-created patients and appointments start `pending` (`CTX-DEC-20261017-pending-registration-no-duplicates`).
- CPF: encrypted at rest plus a keyed hash for uniqueness lookups; never logged; never sent to n8n unless strictly needed.
- Consent and opt-out: `CTX-DEC-20261017-consent-and-opt-out`; every trigger checks `do_not_contact` immediately before sending.
- Trigger scheduling: creating, moving or cancelling an appointment (or marking a procedure completed) recomputes its scheduled_triggers in the same transaction; obsolete ones become `cancelled`.
- Dispatch: a worker (same codebase, second process) claims due rows with `FOR UPDATE SKIP LOCKED` (or a vetted Postgres queue library such as pg-boss; not evaluated yet), POSTs the webhook, and applies `CTX-DEC-20261017-trigger-delivery-retries`.

## Open choices
ORM/migration tool, queue library vs hand-written outbox worker, how CPF key is stored (env var name only, never in Context).

## Adjustment 2026-10-17
`CTX-DEC-20261017-mvp-simplified`: use a simpler `reminders` table (appointment, kind, due_at, status, attempts, claimed_at) instead of the scheduled_triggers outbox; skip RLS, quotes, audit_log and availability complexity in the MVP. The rest of the model stands.
