---
id: CTX-DEC-20261016-single-db-owner
type: decision
title: O banco de dados tem um único dono: o back-end do app
branch: architecture
tags: [database, architecture]
status: active
confidence: high
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-DEC-20261016-three-engines]
---

# Decision
Only the app back end accesses the database. n8n and any other consumer read/write data exclusively through the app's API.

## Rationale
User preference: a single owner for the database.

## Consequences
The app API must cover everything n8n needs (patients, appointments, triggers). Service-to-service auth is needed (see `CTX-QUE-20261016-service-auth`). Database engine still undecided (`CTX-QUE-20261016-database-engine`).
