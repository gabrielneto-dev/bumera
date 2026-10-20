---
id: CTX-QUE-20261014-clinic-data-source
type: question
title: De onde virão os dados de pacientes/agendamentos/orçamentos da clínica?
branch: product
tags: [data, integration, scheduling]
status: answered
created_at: 2026-10-14
updated_at: 2026-10-16
related: [CTX-PLN-20261014-simple-scheduling-interface]
resolved_by: CTX-PLN-20261014-simple-scheduling-interface
---

## Question
Modules 1–3 need last-visit dates, quotes and appointments. Will data be entered via Bumera's own simple interface, imported (CSV), or integrated from the clinics' existing software?

## Why this matters
It determines effort, the data model and whether the "simple" scope holds. (Agent-identified gap; user mentioned only a simple scheduling interface.)

## How to resolve
Ask user / observe pilot clinics' current tools.

## Answer (2026-10-16)
Patient data comes from the secretary registering it in the app, or from WhatsApp (then the secretary must confirm). Best option to be configured/identified later; no integration with existing clinic software was mentioned. Details: `CTX-QUE-20261016-patient-fields-and-whatsapp-registration`.
