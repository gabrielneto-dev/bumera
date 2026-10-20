---
id: CTX-DEC-20261016-postgresql
type: decision
title: PostgreSQL como banco de dados do app
branch: architecture
tags: [database, stack]
status: active
confidence: high
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-DEC-20261016-single-db-owner, CTX-DEC-20261016-saas-multi-tenant]
---

# Decision
PostgreSQL, owned solely by the app back end (`CTX-DEC-20261016-single-db-owner`). Chosen from the options PostgreSQL / SQLite, recommended for multi-clinic data and consolidated backups.

## Open
ORM/migration library; backup strategy (`CTX-QUE-20261016-home-server-exposure-backups`).
