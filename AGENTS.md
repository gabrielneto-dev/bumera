# Bumera — Agent Instructions

Project-wide operating instructions shared by all AI agents. Detailed knowledge lives in `Context/`, not here.

## Project operating rules

- Development and production run on the user's server, reachable with `ssh my-server` (inventory: `CTX-FCT-20261017-server-inventory`).
- Server layout since 2026-10-21: shared stack in `~/infra` (Postgres, pgAdmin, n8n; docker network `infra`; never stop or modify it without the user's say) and the Bumera app stack in `~/bumera-app` (app, Evolution, Redis; runbook in `deploy/README.md`). `~/bumera` is the stopped old stack.
- The server was wiped of all previous Docker workloads on 2026-10-18 (n8n, Evolution, Postgres, pgAdmin, flip-radar, DeskcommCRM). Archives are in `~/backup-pre-limpeza-20261018` on the server; do not delete them without the user's say. Bumera resources live in their own compose project under `~/bumera-app`. If other projects appear on the server later, never touch containers, volumes or files that do not belong to Bumera.
- Never read or print `.env` files or tokens on the server; refer to variable names only.
- Never run tests or destructive scripts against the production database.
- Production data (`bumera_prod`) changes only through the app; test data is created through the app UI. A direct SQL write (e.g. reverting a test record) needs the user's explicit OK and a Bash permission rule, and writes to the shared `~/infra` services are blocked by default: never work around that block.
- Deploying: rebuild BOTH images (`docker compose build app` and `docker compose --profile tools build migrate`) before running migrations; never print responses of Evolution's `/webhook/set` or `/webhook/find` (they echo the secret URL).
- Use `npm` (the host `pnpm` is broken). Checks before finishing work: `npm run typecheck`, `npm run lint`, `npm run test:coverage` (80% minimum; tests need the SSH tunnel below).
- Dev database lives on the server (container `bumera-postgres`, bound to the server's 127.0.0.1:5432). Open the tunnel with `ssh -fN -L 5433:127.0.0.1:5432 my-server`; `.env.local` (git-ignored) points at port 5433. Tests refuse any database whose name does not end in `_test`.
- `npm run test:e2e` drives a real browser (Playwright, Chromium) against a separate Next server on port 3100 and the `bumera_test` database (needs the tunnel; it empties that database first and refuses any name not ending in `_test`).
- Services live in `lib/services/*` (permissions via `lib/authz.ts`, input via `lib/schemas.ts`, failures as `AppError`); pages and server actions only call them. Everything the system would e-mail goes through `lib/email.ts` (shown on screen for now).
- Business data is accessed only through `scopedPrisma` (`lib/tenant-scope.ts`); register every new tenant table in its `TENANT_MODELS` and give it an `organizationId`. Do not use raw SQL for tenant data.
- `npx auth@latest generate` overwrites `prisma/schema.prisma`; keep the Bumera models section (below the marker) when regenerating.
- Prisma is pinned to 7.x on purpose (npm `latest` for `prisma` is an 8.0 release candidate).
- Next.js 16 with Cache Components: request-time data (session, headers) must be read behind a `<Suspense>` boundary. Read `node_modules/next/dist/docs/` before writing Next code.

<!-- CONTEXT-ENGINEERING:START -->

# Project Context System

This project uses `Context/` as its persistent project memory and knowledge system.

## Context discovery

For every non-trivial task:

1. Read `Context/MAP.md`.
2. Read `Context/STATE.md`.
3. Determine which context branches are relevant.
4. Read only the corresponding branch `_index.md` files.
5. Retrieve atomic records only when required.
6. Follow `related`, `depends_on`, `source_ids`, `supersedes`, and `superseded_by` only when they materially affect the current task.
7. Do not recursively load the entire `Context/` directory.

Use progressive context loading.

## Sources of truth

- `AGENTS.md` — permanent operational instructions.
- `Context/MAP.md` — context routing and navigation.
- `Context/STATE.md` — current project state.
- `Context/core/**` — stable project fundamentals.
- `Context/branches/**` — domain-specific knowledge.
- `Context/global/**` — cross-cutting decisions, questions, assumptions, risks and plans.
- `Context/checkpoints/**` — distilled session/milestone checkpoints.
- `Context/sources/**` — provenance and evidence.
- `Context/_meta/**` — context configuration, taxonomy, catalog and maintenance metadata.

## Context write policy

Context reading is automatic for non-trivial work.

Context persistence is controlled.

Do not write documentation for every conversation message.

Run the Context Save Protocol when the user expresses an intent equivalent to:

- `salvar contexto`
- `salve o contexto`
- `save context`
- `persistir contexto`
- `atualizar contexto`
- `atualizar memória do projeto`
- `criar checkpoint`
- `checkpoint da sessão`

When triggered, follow `Context/README.md`.

Do not copy the conversation verbatim.

Persist distilled, durable knowledge.

## Safety

Never persist secrets, passwords, access tokens, API keys, private keys, session cookies or credential values inside `Context/`.

References to environment-variable names or secret-manager locations are allowed.

## Maintenance

If a durable, project-wide operating rule is discovered, evaluate whether it belongs in `AGENTS.md`.

Do not put transient state or detailed knowledge in `AGENTS.md`.

<!-- CONTEXT-ENGINEERING:END -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
