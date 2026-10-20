---
id: CTX-RSK-20261014-whatsapp-unofficial-api
type: risk
title: Risco de bloqueio/instabilidade ao usar API não oficial de WhatsApp
branch: architecture
tags: [whatsapp, evolution-api]
status: open
confidence: medium
created_at: 2026-10-14
updated_at: 2026-10-14
related: [CTX-QUE-20261014-whatsapp-integration-approach]
---

# Risk (agent-identified, to verify)

Evolution API is, to my understanding, an unofficial WhatsApp integration (not verified in this session); numbers used for bulk reactivation/follow-ups may be banned and clinics could lose their number. Verify before committing; compare with the official Cloud API. Mitigation: low message volume, opt-in, official API when feasible.
