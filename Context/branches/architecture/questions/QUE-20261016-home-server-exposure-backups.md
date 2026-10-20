---
id: CTX-QUE-20261016-home-server-exposure-backups
type: question
title: Como expor o servidor doméstico com segurança e fazer backup?
branch: architecture
tags: [hosting, security, backups]
status: answered
created_at: 2026-10-16
updated_at: 2026-10-17
resolved_by: CTX-DEC-20261017-network-exposure-phased
---

## Question
Como expor o servidor doméstico com segurança e fazer backup?

## Why this matters
Clinics reach the system by URL from a home machine.

## What depends on the answer
Availability, patient-data security, pilot trust.

## Known options
Tunnel/reverse proxy vs port forwarding with dynamic DNS; off-site backup destination; uptime monitoring.

## How to resolve
Answer in the questionnaire (user), then record a DEC and mark this answered.

## Partial answer (2026-10-17)
Exposure: the user already uses a Cloudflare Tunnel with an owned domain; users reach the app by that domain (`CTX-DEC-20261016-self-hosted-home-server`). Still open: backups (destination, frequency, restore test), uptime monitoring, protecting admin endpoints such as n8n.

## Answer (2026-10-17)
See `CTX-DEC-20261017-network-exposure-phased` and `CTX-DEC-20261017-defer-backups`.
