---
id: CTX-RSK-20261016-home-server-availability
type: risk
title: Servidor doméstico: disponibilidade, exposição à internet e perda de dados
branch: architecture
tags: [hosting, security, backups]
status: open
confidence: medium
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-DEC-20261016-self-hosted-home-server]
---

# Risk (agent-identified)
Home internet/power outages, dynamic IP, exposing a server with patient data (CPF) to the internet, no backups, single machine. Impact: missed reminders (core value), data loss, LGPD exposure (`CTX-RSK-20261014-lgpd-patient-data`).
Mitigation ideas (undecided): secure tunnel/reverse proxy, automated off-site backups, monitoring, UPS. Acceptable for a 1–3 clinic pilot; revisit before paying clients.

Update 2026-10-17: exposure is mitigated by the Cloudflare Tunnel (no open inbound ports). Remaining: backups, outages, and keeping n8n/admin interfaces off the public hostname or behind access control.

Update 2026-10-17: backups deferred (`CTX-DEC-20261017-defer-backups`) and n8n temporarily public (`CTX-DEC-20261017-network-exposure-phased`) are accepted risks to revisit before real patient data/first client.
