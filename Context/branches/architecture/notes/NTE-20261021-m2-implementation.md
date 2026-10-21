---
id: CTX-NTE-20261021-m2-implementation
type: note
title: Mapa do código do M2 (lembretes): onde está cada coisa, o contrato para o n8n e as armadilhas
branch: architecture
tags: [architecture, api, triggers, reminders, n8n, security]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261020-m1-implementation, CTX-DEC-20261021-reminders-consent-and-stale-guard, CTX-DEC-20261017-mvp-simplified, CTX-RSK-20261021-service-key-and-claim-races]
---

# M2 code map (commit 79bd0e6, local at the time of writing)

## Data
Table `reminder` (migration `20261021120000_m2_reminders`): one row per `(appointmentId, kind)`, tenant-scoped (`Reminder` is in `TENANT_MODELS`), composite FK `(appointmentId, organizationId)`. Status: PENDING, CLAIMED, SENT, FAILED, CANCELLED, SKIPPED. `dueAt` is the earliest pick-up time and moves forward on retries; `attempts` counts claims; `note` holds a reason/last error (never message text or PII). `Appointment` gained `@@unique([id, organizationId])`.

## Pure logic (`lib/reminders/`)
`plan.ts` (what reminders an appointment should have), `guard.ts` (stale/consent check, `MAX_ATTEMPTS`, `retryDelayMs`), `messages.ts` (pt-BR texts, `sanitizeName`, `firstName`), `sync.ts` (reconcile unsent reminders; called **inside the same transaction** as `bookAppointment` and `changeAppointmentStatus` through `ctx.db.$transaction`), `dispatch.ts` (service side: `claimDueReminders`, `recordReminderResult`).

## Service API for n8n (`/api/v1`, Bearer `SERVICE_API_KEY`, envelope `{success,data,error,meta}`)
- `GET /api/v1/reminders/due?limit=1..50` claims due reminders of **all** clinics. Item: `id, kind, attempt, message, clinic{id,name}, patient{id,firstName,phone}, appointment{id,startsAt,endsAt,dentistName,procedureName}`. No CPF or birth date.
- `POST /api/v1/reminders/{id}/result` body `{"outcome":"sent","attempt":N}` or `{"outcome":"failed","attempt":N,"error":"..."}` (body <= 4 KB). Idempotent; a report whose `attempt` is not the one currently claimed, or for a reminder no longer claimed, changes nothing and returns the current status.
- 401 wrong/missing key, 503 key not configured (env var shorter than 32 chars counts as not configured; read per request via `lib/service-auth.ts`).
- n8n flow for M3: poll every ~5 min, send `message` to `patient.phone` through Evolution, report the result with the same `attempt`.

## Secretary alert
`lib/services/reminders.ts#listFailedReminders` feeds the "Mensagens que não saíram" section of `/pendentes`.

## Traps
- Claiming uses raw SQL only to lock ids (`FOR UPDATE SKIP LOCKED`) — a documented exception to "no raw SQL for tenant data"; everything else goes through Prisma. The service side uses the unscoped client on purpose because it serves all clinics.
- Prisma `upsert` through the tenant scope is not atomic (extra filter in `where`); concurrency safety of `sync` relies on the appointment row lock taken by the status `UPDATE` in the same transaction, not on the upsert.
- A claim not reported within 10 minutes is handed out again (attempts +1); after `MAX_ATTEMPTS` the next claim marks it FAILED instead of re-sending.
- `getEnv()` caches; the service key is deliberately read from `process.env` on each request.
- Tests: `tests/reminders/*` (pure logic, DB integration incl. concurrent pollers and tenant isolation, API) and an e2e step where "n8n" polls and reports a delivery. Patient factory now defaults to a recorded consent.
