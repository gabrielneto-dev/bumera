---
id: CTX-QUE-20261014-stack-final
type: question
title: Qual a stack final (Next.js/Node, n8n ou código próprio, banco)?
branch: architecture
tags: [stack, n8n, database]
status: answered
created_at: 2026-10-14
updated_at: 2026-10-16
related: [CTX-ASM-20261014-stack-candidates]
resolved_by: CTX-DEC-20261016-stack-nextjs-n8n
---

## Question
Use n8n for flows or implement flows in code? Which shared database? Hosting?

## What depends on the answer
All implementation; per-client operating cost.

## How to resolve
Discussion with user, then record a decision (DEC).

## Answer (2026-10-16)
n8n for flows; Next.js + Tailwind + shadcn/ui; database owned solely by the app. Database engine, ORM and auth library remain open: `CTX-QUE-20261016-database-engine`.
