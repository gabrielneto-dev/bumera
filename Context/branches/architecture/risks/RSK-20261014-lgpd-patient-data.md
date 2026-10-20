---
id: CTX-RSK-20261014-lgpd-patient-data
type: risk
title: Dados sensíveis de pacientes (CPF, contexto de saúde) e LGPD
branch: architecture
tags: [lgpd, privacy, data]
status: open
confidence: medium
created_at: 2026-10-14
updated_at: 2026-10-14
---

# Risk (agent-identified)

The system will store CPF and patient treatment/appointment info and message patients. Brazilian LGPD obligations (consent, purpose, security, processor contract with clinics) apply. Mitigation: collect minimum fields, secure storage, access control, contract/consent terms; get legal review before paid clients. Never store credentials in `Context/`.

Update 2026-10-17: if an LLM via OpenRouter is used, patient messages go to third parties; mask identifiers (CPF) before sending and review provider data-retention terms.
