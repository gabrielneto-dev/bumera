---
id: CTX-RSK-20261021-evolution-publicly-exposed
type: risk
title: Evolution API alcançável pela internet sem Cloudflare Access
branch: architecture
tags: [security, evolution-api, hosting]
status: open
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-DEC-20261017-network-exposure-phased, CTX-RSK-20261014-whatsapp-unofficial-api]
revisit_at: before real patient data or first client
---

# Risk
On 2026-10-21 `evolution.gnslab.com.br` answered HTTP 200 without Cloudflare Access (pgAdmin is protected by it). The API requires the `apikey` header, but the root page and `/manager` are reachable. The target state is that Evolution is reachable only on the internal network. n8n is also public (accepted risk, phased exposure).
## Mitigation (proposed)
Put the hostname behind Cloudflare Access like pgAdmin, or remove the public hostname (n8n and the app already reach it over the docker network).
