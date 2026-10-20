---
id: CTX-DEC-20261017-consent-and-opt-out
type: decision
title: Consentimento registrado e opt-out ("SAIR") para mensagens aos pacientes
branch: product
tags: [whatsapp, lgpd, privacy]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-RSK-20261014-whatsapp-unofficial-api, CTX-RSK-20261014-lgpd-patient-data]
---

# Decision
Record each patient's consent to receive messages, and let the patient stop messages by replying a keyword (e.g. "SAIR"); a do-not-contact flag must be honored by all triggers/flows (app and n8n). Reduces number-ban risk (`CTX-RSK-20261014-whatsapp-unofficial-api`) and LGPD exposure.

## Open
Exact consent wording/capture moment, message templates, rate limits.
