---
id: CTX-QUE-20261016-patient-fields-and-whatsapp-registration
type: question
title: Quais campos do paciente além de nome e CPF, e como funciona o cadastro via WhatsApp com confirmação da secretária?
branch: product
tags: [patient, data, whatsapp, lgpd]
status: answered
created_at: 2026-10-16
updated_at: 2026-10-17
resolved_by: CTX-DEC-20261017-pending-registration-no-duplicates
---

## Question
Quais campos do paciente além de nome e CPF, e como funciona o cadastro via WhatsApp com confirmação da secretária?

## Why this matters
Data minimization (LGPD) vs usefulness; registration can originate from WhatsApp and the secretary confirms it.

## What depends on the answer
Patient schema, confirmation queue UI, flow in n8n.

## Known options
Minimum: name, CPF, phone/WhatsApp, birth date?; status pending/confirmed.

## How to resolve
Answer in the questionnaire (user), then record a DEC and mark this answered.

## Answer (2026-10-17)
See `CTX-DEC-20261017-pending-registration-no-duplicates` and `CTX-DEC-20261017-patient-minimum-fields`.
