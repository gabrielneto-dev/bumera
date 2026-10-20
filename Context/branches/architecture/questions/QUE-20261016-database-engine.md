---
id: CTX-QUE-20261016-database-engine
type: question
title: Qual banco de dados (PostgreSQL, SQLite, outro) e qual ORM?
branch: architecture
tags: [database, stack]
status: answered
created_at: 2026-10-16
updated_at: 2026-10-16
resolved_by: CTX-DEC-20261016-postgresql
---

## Question
Qual banco de dados (PostgreSQL, SQLite, outro) e qual ORM?

## Why this matters
The app is the single DB owner; need an engine suited to a home server, backups and multi-clinic data.

## What depends on the answer
Schema, backups, hosting, ORM/migrations.

## Known options
PostgreSQL (robust, multi-tenant friendly) vs SQLite (simplest, easy backup) vs MySQL.

## How to resolve
Answer in the questionnaire (user), then record a DEC and mark this answered.

## Answer (2026-10-16)
See `CTX-DEC-20261016-postgresql`.

Note: ORM/migration tool still open.
