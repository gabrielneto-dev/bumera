---
id: CTX-NTE-20261022-lgpd-audit-export-erasure
type: note
title: LGPD no app: registro de atividades, exportação dos dados do paciente e exclusão (anonimização)
branch: architecture
tags: [lgpd, privacy, security, architecture, data]
status: active
confidence: high
created_at: 2026-10-22
updated_at: 2026-10-22
related: [CTX-NTE-20261021-lgpd-checklist, CTX-RSK-20261014-lgpd-patient-data, CTX-NTE-20261022-whatsapp-per-clinic]
---

# LGPD features (commit 48d3e27, migration 20261022140000_lgpd_audit_anonymization)

## Activity log
- Table `audit_log` (tenant model `AuditLog`): `actorType` USER|SYSTEM, `actorUserId`, `action` (enum `AuditAction`), `patientId` (no foreign key: it must outlive an erasure), `entityId`, `details` JSON, `createdAt` (database clock). A DB trigger rejects UPDATE; rows go away only with their clinic. It holds **no personal values**: ids, action names, changed field names, statuses.
- `lib/audit.ts` `recordAudit(db, {organizationId, userId|null}, entry)`, called in the same transaction as the change. Recorded: patient created/updated (field names)/confirmed, consent renewed, patient opted out (SYSTEM), export, erasure; appointment booked and status changed (from/to); patient answered by WhatsApp (SYSTEM, answer); quote created/closed; settings changed (only fields that actually changed; no entry when nothing changed); WhatsApp instance changed (connected true/false). `AUDIT_ACTION_LABEL` has the pt-BR texts.
- `lib/services/audit.ts` `listAuditLog` (permission `audit:read`, admin only; resolves the current patient name, "Paciente removido" after erasure); screen `/atividades` (menu "Atividades", resolves actor names from the user table).

## Export (art. 18, II and V)
`lib/services/patient-privacy.ts` `exportPatientData` (secretary and admin: needs `patient:update`): JSON with the patient (full CPF decrypted, phone, birth date, consent, opt-out), appointments (dentist, procedure), quotes (value in reais), messages sent (kind, status, attempts, dates; text is not stored), logged as PATIENT_EXPORTED. Download route `GET /pacientes/[id]/exportar` (`Content-Disposition` attachment, `no-store`); refuses other clinics (404), roles without permission (403), erased patients (410). Button "Exportar" on the patient list.

## Erasure (art. 18, VI): `anonymizePatient`
Admin only (`patient:delete`), idempotent, irreversible. Sets name "Paciente removido", clears CPF (cipher and hash), phone "REMOVIDO", birth date, consent; `doNotContact` true; `anonymizedAt`. In the same transaction: cancels PENDING/CLAIMED reminders of the patient's appointments and quotes, closes open quotes as DECLINED, replaces every quote description with "(removido)", records PATIENT_ANONYMIZED. The row stays because appointments and quotes reference it. An erased patient is refused (`ANONYMIZED_PATIENT`) for update, consent renewal, booking, quotes and export; the list shows a "Dados apagados" badge. Button "Apagar dados" with a browser confirm. The old phone no longer matches inbound messages.

## Verified
497 tests (~96.7%). In production on 2026-10-22: Exportar for the test patient wrote PATIENT_EXPORTED; the Atividades screen listed it with the actor's name. "Apagar dados" was NOT exercised in production (the browser confirm dialog is not operated by the agent and the owner should confirm an irreversible erasure); it is covered by automated tests.

## Known limits
- Evolution keeps contacts and conversations in its own database: erasing in the app does not erase there. A full erasure request also needs those removed in Evolution (not automated).
- Reads of patient data are not logged (only changes, exports, erasures); no retention policy or automatic erasure of long-inactive patients; legal documents (privacy notice, processor contract) still need a lawyer.
