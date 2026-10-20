---
id: CTX-DEC-20261016-saas-multi-tenant
type: decision
title: Modelo SaaS multi-tenant: uma instalação, várias clínicas com dados isolados
branch: architecture
tags: [multi-tenancy, architecture]
status: active
confidence: high
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-DEC-20261016-three-engines]
---

# Decision
Bumera is a SaaS: a single installation serves all clinics; each clinic signs up via URL and sees only its own data.

## Consequences
Every table needs tenant (clinic) scoping and isolation enforced in the app back end; n8n flows must carry the clinic identifier; LGPD isolation matters (`CTX-RSK-20261014-lgpd-patient-data`). Roles/auth still open (`CTX-QUE-20261016-auth-and-roles`).
