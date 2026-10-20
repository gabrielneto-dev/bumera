---
id: CTX-QUE-20261016-multi-tenancy
type: question
title: Uma instalação para várias clínicas (multi-tenant) ou uma instância por clínica?
branch: architecture
tags: [multi-tenancy, architecture]
status: answered
created_at: 2026-10-16
updated_at: 2026-10-16
resolved_by: CTX-DEC-20261016-saas-multi-tenant
---

## Question
Uma instalação para várias clínicas (multi-tenant) ou uma instância por clínica?

## Why this matters
Each clinic creates its own user via URL on a single home server. Isolation of patient data between clinics is required either way.

## What depends on the answer
Data model, auth, cost per clinic, LGPD isolation.

## Known options
Single shared instance with tenant isolation (likely cheapest) vs one instance per clinic (stronger isolation, heavier).

## How to resolve
Answer in the questionnaire (user), then record a DEC and mark this answered.

## Answer (2026-10-16)
See `CTX-DEC-20261016-saas-multi-tenant`.
