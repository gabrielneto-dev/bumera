---
id: CTX-QUE-20261016-auth-and-roles
type: question
title: Como será login e permissões (secretária, dentista, admin)?
branch: architecture
tags: [auth, security]
status: answered
created_at: 2026-10-16
updated_at: 2026-10-17
resolved_by: CTX-DEC-20261017-auth-email-password-invites
---

## Question
Como será login e permissões (secretária, dentista, admin)?

## Why this matters
Clinics create their user via URL; patient data is sensitive.

## What depends on the answer
Auth library choice, role model, onboarding flow.

## Known options
Email+password via a vetted library; roles: admin/clinic owner, secretary, dentist.

## How to resolve
Answer in the questionnaire (user), then record a DEC and mark this answered.

## Partial answer (2026-10-17)
Roles decided: `CTX-DEC-20261017-roles`. Still open: login method and permission details.

## Answer (2026-10-17)
See `CTX-DEC-20261017-auth-email-password-invites`.
