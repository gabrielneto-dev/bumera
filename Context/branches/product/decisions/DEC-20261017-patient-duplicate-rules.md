---
id: CTX-DEC-20261017-patient-duplicate-rules
type: decision
title: Regra de duplicidade: CPF único por clínica; conflito vira alerta para a secretária
branch: product
tags: [patient, data]
status: active
confidence: medium
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261017-pending-registration-no-duplicates, CTX-DEC-20261016-saas-multi-tenant]
---

# Decision
- CPF is unique within a clinic; the same person may be a patient of different clinics (separate records, SaaS isolation).
- A WhatsApp registration whose CPF already exists does not create a new patient: the secretary is alerted and decides (merge/link/fix phone).
- Patients without CPF (e.g. children) may be registered with the other fields. The user agreed to the proposal as a whole ("pode ser isso mesmo"); the no-CPF part was part of that proposal, so confidence is medium.

## Open
How duplicates are detected for patients without CPF (e.g. name + birth date + phone) is not defined.
