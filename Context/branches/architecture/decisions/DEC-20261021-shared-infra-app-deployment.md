---
id: CTX-DEC-20261021-shared-infra-app-deployment
type: decision
title: Deploy do app em ~/bumera-app sobre a infra compartilhada (~/infra), app público em bumera.gnslab.com.br
branch: architecture
tags: [hosting, infrastructure, n8n, evolution-api]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-QUE-20261018-app-deployment, CTX-DEC-20261018-no-proxmox-clean-server, CTX-DEC-20261017-network-exposure-phased]
---

# Decision
- On 2026-10-21 the user moved the server to a **shared stack in `~/infra`** (compose project `infra`: Postgres with an `admin` superuser, pgAdmin, n8n; docker network `infra`; per-project roles/databases through `~/infra/scripts/new-db.sh`). The old `~/bumera` stack is stopped and only kept as a backup. Hostnames now exist for n8n (`n8n.gnslab.com.br`), pgAdmin (behind Cloudflare Access) and Evolution.
- The Bumera app stack lives in **`~/bumera-app`** (project `bumera-app`: `app`, `evolution`, `redis`) and joins the external network `infra`. Database `bumera_prod` (role `bumera`) and `evolution` (own role) live in the shared Postgres. Image built on the server (one build at a time, heap capped at 1536 MB).
- Public hostname of the app: `bumera.gnslab.com.br` (Cloudflare Tunnel -> 127.0.0.1:3000). n8n reaches the app and Evolution over the docker network (`http://bumera-app:3000`, `http://bumera-evolution:8080`), so no public hostname is needed for service-to-service calls.
## Rule
Never stop or modify the shared `infra` stack without the user's say (the user once stopped everything on purpose; other sessions may do the same).
## Consequences
Answers `CTX-QUE-20261018-app-deployment`. Runbook: `deploy/README.md`. See `CTX-NTE-20261021-m2-m3-implementation`.
