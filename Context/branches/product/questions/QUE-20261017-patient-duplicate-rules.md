---
id: CTX-QUE-20261017-patient-duplicate-rules
type: question
title: Como detectar paciente duplicado (CPF por clínica, sem CPF, CPF já existente vindo do WhatsApp)?
branch: product
tags: [patient, data]
status: answered
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261017-pending-registration-no-duplicates]
resolved_by: CTX-DEC-20261017-patient-duplicate-rules
---

## Question
What defines the same person? Likely CPF unique per clinic; but what about patients registered without CPF, and when a WhatsApp registration arrives with a CPF that already exists (merge, link new phone, or flag for the secretary)? Same CPF in two different clinics is allowed under the SaaS model?

## What depends on the answer
Patient schema/constraints, secretary confirmation queue.

## Known options
Unique (clinic_id, CPF); phone number as secondary key; flag-for-review on conflict.

## How to resolve
User answer, then update `CTX-DEC-20261017-pending-registration-no-duplicates`.

## Answer (2026-10-17)
See `CTX-DEC-20261017-patient-duplicate-rules`.
