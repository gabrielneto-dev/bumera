---
id: CTX-QUE-20261021-opt-out-reactivation
type: question
title: Como reativar mensagens de um paciente descadastrado, e o SAIR deve cancelar consultas futuras?
branch: architecture
tags: [whatsapp, lgpd, product-modules]
status: answered
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261021-m4-inbound-replies, CTX-RSK-20261014-lgpd-patient-data]
---
## Question
Today a patient who answers SAIR can only be re-enabled by editing the database. Should the patient screen get a "Permitir mensagens novamente" action (requires a recorded new consent)? Should SAIR also cancel or flag the patient's future appointments? Currently it does neither: appointments stay and only messages stop.
## How to resolve
User decision; proposal: a secretary action that clears `doNotContact` and records the consent source, audited.

## Answer (2026-10-21, commit c461acf)
Built with the agent's recommendation (the user asked to resolve the pending items): the patient screen has "Permitir mensagens", which needs an explicit consent checkbox and records `consentAt` and `consentSource = secretary_reactivation`. SAIR keeps only stopping messages: appointments are untouched. Reminders skipped while opted out are not resent.
