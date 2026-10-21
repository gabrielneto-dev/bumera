---
id: CTX-DEC-20261021-generic-shared-infra
type: decision
title: Postgres, pgAdmin e n8n como infra genérica do servidor (~/infra), com banco e usuário por projeto
branch: architecture
tags: [hosting, infrastructure, database, n8n, security, multi-tenancy]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-FCT-20261021-server-infra-state, CTX-DEC-20261018-no-proxmox-clean-server, CTX-DEC-20261016-single-db-owner]
---

# Decision
The user wants Postgres, pgAdmin and n8n to be generic server infrastructure usable by any project, not Bumera resources. They live in their own compose project `infra` under `~/infra` (versioned reference copy: `deploy/infra/`, with README). Each project gets its own database and role via `~/infra/scripts/new-db.sh <name> [--with-test]` (role without superuser, `CREATEDB`; credentials written to `~/infra/projects/<name>.env`, mode 600, nothing printed). Superuser `admin` is for administration only.

## Why / how it was done
- Bumera had its own Postgres/n8n/pgAdmin in `~/bumera`; the user said they should be generic. Migration on 2026-10-21: per-database `pg_dump -Fc`, roles from `pg_dumpall --roles-only` with attributes rewritten (the dump marks the original role SUPERUSER; it was restored as NOSUPERUSER CREATEDB, password hash preserved so Bumera URLs did not change), `pg_restore --no-owner --role=bumera`. Row counts matched before/after; the n8n volume was copied (same encryption key); pgAdmin started fresh with a pre-registered server.
- Isolation: Postgres lets every role CONNECT to every database by default (a test role could open `bumera_dev`). `new-db.sh` now runs `REVOKE CONNECT ... FROM PUBLIC` per new database and it was applied to `bumera_dev`/`bumera_test`; verified with two throwaway projects.
- Everything listens on 127.0.0.1 only; access by SSH tunnel (`npm run db:tunnel`, `npm run ui:tunnel`). n8n is additionally reachable through the Cloudflare tunnel domain (`CTX-FCT-20261021-server-infra-state`).

## Consequences
- AGENTS.md operating rules were updated (shared infra under `~/infra`; Bumera's own future app gets its own compose project under `~/bumera`).
- A project running in a container joins docker network `infra` (`networks: default: {name: infra, external: true}`) and uses host `postgres`.
- Never touch databases/containers that do not belong to the project being worked on.
