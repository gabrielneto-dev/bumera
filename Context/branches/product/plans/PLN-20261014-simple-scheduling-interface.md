---
id: CTX-PLN-20261014-simple-scheduling-interface
type: plan
title: Interface de agendamento simples (nome, CPF e poucos campos)
branch: product
tags: [scheduling, ui]
status: candidate
confidence: medium
created_at: 2026-10-14
updated_at: 2026-10-14
related: [CTX-ASM-20261014-stack-candidates, CTX-RSK-20261014-lgpd-patient-data]
---

# Plan (candidate)

Build a simple scheduling/registration interface collecting client name, CPF and a few other fields; it feeds the shared database that modules read. Exact fields undefined. Likely a Next.js UI (stack not final).

## Update 2026-10-16
This interface is part of the app engine (`CTX-DEC-20261016-three-engines`); it is a dental scheduling system (calendar, patient registration, scheduling API). Used by the clinic secretary, who also confirms registrations that originate from WhatsApp.
