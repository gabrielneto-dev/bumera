---
id: CTX-FCT-20261021-server-infra-state
type: fact
title: Estado do servidor em 2026-10-21 — infra genérica (Postgres, pgAdmin, n8n), domínio do n8n e túneis
branch: architecture
tags: [hosting, infrastructure, n8n, database, security]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-DEC-20261021-generic-shared-infra, CTX-DEC-20261017-network-exposure-phased, CTX-FCT-20261017-server-inventory]
supersedes: CTX-FCT-20261017-server-inventory
---

# Server state (`ssh my-server`, observed 2026-10-21)

## What runs (compose project `infra`, dir `~/infra`; reference copy in repo `deploy/infra/`)
| Container | Image | Server bind | From the dev machine |
|---|---|---|---|
| `infra-postgres` | postgres:16-alpine | 127.0.0.1:5432 | `npm run db:tunnel` -> localhost:5433 |
| `infra-pgadmin` | dpage/pgadmin4 (pinned by digest) | 127.0.0.1:5050 | `npm run ui:tunnel` -> localhost:5050 |
| `infra-n8n` | n8nio/n8n:2.44.5 | 127.0.0.1:5678 | `npm run ui:tunnel` -> localhost:5678, or the public domain below |
Memory limits: postgres 768m, pgadmin 384m, n8n 768m (host has 3.7 GB RAM, ~39 GB free disk). Network `infra`; volumes `infra_infra_pgdata`, `infra_infra_pgadmin_data`, `infra_infra_n8n_data`.

## n8n public domain
- `https://n8n.gnslab.com.br` (user-owned domain) reaches the container through the existing Cloudflare Tunnel (`cloudflare.service`, token file under `/etc/cloudflared/`, hostname route managed in the Cloudflare dashboard, not visible from the server). It answers 200 on `/healthz`.
- n8n env: `N8N_HOST=n8n.gnslab.com.br`, `N8N_PROTOCOL=https`, `N8N_WEBHOOK_URL=https://n8n.gnslab.com.br/`, `N8N_EDITOR_BASE_URL=https://n8n.gnslab.com.br`, `N8N_PROXY_HOPS=1`, `N8N_SECURE_COOKIE=true`. n8n 2.x deprecates `WEBHOOK_URL` in favour of `N8N_WEBHOOK_URL`; with the right URL set, the editor logs "accessible via https://n8n.gnslab.com.br" and shows production webhook URLs on that domain.
- Data: n8n uses SQLite in its volume (not Postgres). Credentials are encrypted with `N8N_ENCRYPTION_KEY` (name only here): losing it makes saved n8n credentials unreadable, so it must be backed up outside the server.
- n8n's instance-level MCP endpoint is `/mcp-server/http` (token-protected); see `CTX-QUE-20261021-n8n-mcp-access`.

## Credentials location (values are NOT in Context)
Server: `~/infra/.env` (mode 600). User's Obsidian vault note "Servidor - Infra (Postgres, pgAdmin, n8n)". Per-project database credentials: `~/infra/projects/<name>.env`.

## Cleaned up / retired
- 2026-10-21: the two DeskcommCRM cron lines of user `gabriel` (log drain every minute, update agent every 5 min) were removed; the crontab is now empty; backup at `~/crontab-backup-20261021.txt`. They were failing (CRM containers had been removed on 2026-10-18). No Playwright/Facebook process was found running on the server.
- The old Bumera-owned stack (`~/bumera/compose.yml`: `bumera-postgres`, `bumera-n8n`, `bumera-pgadmin`) is **stopped, not removed** (volumes `bumera_bumera_*`), kept as backup together with the migration dumps in `~/infra/migration-bumera/`. Removal needs the user's say-so.
- Older archives: `~/backup-pre-limpeza-20261018` (do not delete without the user's say).

## Notes
- `/etc/cloudflared` is not readable by the normal user; `sudo` needs a password (no passwordless sudo).
- Docker compose v5, Docker 29, x86_64.
