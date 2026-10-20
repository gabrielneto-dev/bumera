---
id: CTX-DEC-20261017-network-exposure-phased
type: decision
title: Exposição de rede em fases: app público; n8n temporariamente exposto, protegido depois
branch: architecture
tags: [hosting, security, n8n]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261016-self-hosted-home-server]
revisit_at: before real patient data or first client
---

# Decision
Target state: only the app is exposed through the Cloudflare Tunnel; n8n and Evolution are reachable only on the user's network and through the app. **For now n8n is also exposed**; protecting it comes later (user decision).

## Agent note / risk
While n8n is public it must at least have strong authentication and secret-protected webhooks; avoid real patient data in flows until protected. See `CTX-RSK-20261016-home-server-availability` and `CTX-QUE-20261016-service-auth`.
