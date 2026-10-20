---
id: CTX-QUE-20261018-email-provider
type: question
title: Qual provedor de e-mail para convites, redefinição de senha e verificação?
branch: architecture
tags: [auth, security, integration]
status: open
created_at: 2026-10-18
updated_at: 2026-10-18
related: [CTX-NTE-20261018-m0-implementation]
---

## Question
Invitations (admin invites secretary/dentist), password reset and e-mail verification need transactional e-mail. Which provider (e.g. Resend, Brevo, SES, own SMTP) and which sender domain?

## Why this matters
Without it the invitation flow cannot work in production (it fails loudly on purpose).

## What depends on the answer
Team onboarding in M1, password recovery, anti-abuse (e-mail verification).

## Known options
Managed API providers with a free tier vs SMTP via the user's domain. Needs a domain with SPF/DKIM records (the user owns a domain behind Cloudflare).

## How to resolve
User choice; agent can compare current prices and free tiers.
