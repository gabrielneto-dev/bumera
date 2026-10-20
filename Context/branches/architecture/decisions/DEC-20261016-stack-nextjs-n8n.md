---
id: CTX-DEC-20261016-stack-nextjs-n8n
type: decision
title: Stack: Next.js + Tailwind + shadcn/ui, n8n confirmado; priorizar velocidade, qualidade e segurança com bibliotecas consolidadas
branch: architecture
tags: [stack, nextjs, n8n, ui]
status: active
confidence: high
created_at: 2026-10-16
updated_at: 2026-10-16
related: [CTX-DEC-20261016-three-engines]
---

# Decision
- n8n is confirmed as the flow engine.
- Next.js with Tailwind CSS and shadcn/ui for the interface (and back-end API in the same project).
- Prioritize speed, quality and security; prefer well-maintained, secure libraries/frameworks over hand-rolled code.

## Not yet decided
Database engine, ORM, auth library, validation library (see questions).
