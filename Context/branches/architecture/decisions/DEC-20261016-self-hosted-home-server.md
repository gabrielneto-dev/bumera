---
id: CTX-DEC-20261016-self-hosted-home-server
type: decision
title: Hospedagem inicial em máquina própria do usuário, acesso por URL
branch: architecture
tags: [hosting, pilot]
status: active
confidence: high
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-RSK-20261016-home-server-availability]
---

# Decision
Initially the app (and its engines) run on a machine the user owns at home. Clinics access via a URL, create their user and use the system. Applies at least to the pilot phase.

## Rationale
Keep cost minimal (pilot fee ~R$50/month covers server and AI cost).

## Consequences
Availability, exposure to the internet, backups and security are the user's responsibility — see `CTX-RSK-20261016-home-server-availability` and `CTX-QUE-20261016-home-server-exposure-backups`.

## Update 2026-10-17
Public access is via an existing Cloudflare Tunnel and the user's own domain (no port forwarding). Backups still undefined.

## Update 2026-10-17
The machine is the user's server (`ssh my-server`), used for development and production including the pilot. Inventory: `CTX-FCT-20261017-server-inventory`.
