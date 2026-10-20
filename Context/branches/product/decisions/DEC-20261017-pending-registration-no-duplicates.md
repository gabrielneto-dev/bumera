---
id: CTX-DEC-20261017-pending-registration-no-duplicates
type: decision
title: Cadastro e agendamento via WhatsApp ficam pendentes até a secretária confirmar; sem pacientes duplicados
branch: product
tags: [patient, whatsapp, scheduling]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261017-patient-minimum-fields, CTX-DEC-20261016-three-engines]
---

# Decision
- A patient registering via WhatsApp may book an appointment right away, but **everything created through WhatsApp stays pending** (patient and appointment) until the secretary confirms it.
- The system must never register the same person twice.

## Open
How "same person" is determined (CPF per clinic? patients without CPF? existing CPF arriving via WhatsApp: merge or flag?): `CTX-QUE-20261017-patient-duplicate-rules`.
