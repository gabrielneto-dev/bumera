---
id: CTX-CP-20261021-1018-m2-redesign-infra
type: checkpoint
title: UI redesenhada, M2 (lembretes), infra genérica no servidor e n8n no domínio próprio
branch: global
tags: [architecture, roadmap, infrastructure, ui, reminders, n8n]
status: active
created_at: 2026-10-21
updated_at: 2026-10-21
---

# Session Checkpoint

## Objective
Redo the whole UI (clean, left sidebar, shadcn + motion), build M2 (reminders for n8n), and turn the server's Postgres/pgAdmin/n8n into generic infra the user can reuse across projects.

## What changed
- **UI redesign** (pushed: 430ffac, d75bfa2, f4394f3): sidebar shell, auth/onboarding/invitation screens, cards/lists, dark mode, 404/error pages, cancelled-appointments toggle, access-denied notice. Validated with a throwaway Playwright audit of ~42 screens. -> `CTX-NTE-20261021-ui-redesign`.
- **M2** (commit 79bd0e6, **not pushed**): `reminder` table, planner/guard/messages/sync/dispatch, `GET /api/v1/reminders/due` and `POST /api/v1/reminders/{id}/result` with Bearer `SERVICE_API_KEY`, failed-message alert on `/pendentes`; 250 unit/integration tests (95.6% statements) + e2e step. A subagent security review found no critical/high issues; medium ones were fixed (attempt token, attempt cap, stale no-show, name sanitizing, body size, tx timeout, pending patients). -> `CTX-NTE-20261021-m2-implementation`, `CTX-DEC-20261021-reminders-consent-and-stale-guard`, `CTX-RSK-20261021-service-key-and-claim-races`.
- **Server**: removed the two DeskcommCRM cron lines (crontab backed up); moved Postgres/pgAdmin/n8n out of the Bumera compose into the generic `~/infra` project; per-project DB script; Bumera DBs migrated with identical row counts; old stack stopped, not removed. -> `CTX-DEC-20261021-generic-shared-infra`, `CTX-FCT-20261021-server-infra-state`.
- **n8n domain**: `https://n8n.gnslab.com.br` (Cloudflare Tunnel) now configured as the webhook/editor URL (`N8N_WEBHOOK_URL`, proxy hops, secure cookie).
- Credentials were saved to the user's Obsidian vault (not in the repo or Context); `.env.local` got a `SERVICE_API_KEY` (name only).

## Decisions
`CTX-DEC-20261021-generic-shared-infra`, `CTX-DEC-20261021-reminders-consent-and-stale-guard` (agent-chosen, to be reviewed by the user).

## Discoveries
- Postgres lets every role CONNECT to every database by default: revoke from PUBLIC per database.
- `pg_dumpall --roles-only` marks the original role SUPERUSER and carries the password hash: rewrite the attributes to restore a least-privilege role without knowing the password.
- n8n 2.x: use `N8N_WEBHOOK_URL`; with an HTTPS proxy set `N8N_PROXY_HOPS=1` and `N8N_SECURE_COOKIE=true`.
- Next 16 route handlers: `GET` is dynamic by default and `params` is a Promise.
- `getEnv()` caches: read per-request secrets from `process.env` when tests/rotation matter.
- `DROP DATABASE` cannot be combined with other statements in one `psql -c`.
- The server has no passwordless sudo and `/etc/cloudflared` is unreadable for the normal user.

## Problems solved
Misunderstanding: no new Postgres had been created — n8n and pgAdmin had been added to Bumera's existing compose; the user wanted generic infra, so it was moved. The first race test of `sync` was unrealistic (two separate transactions without the row lock real status changes take); replaced by two concurrent status changes.

## Failed approaches worth remembering
- The `security-review` skill needs `origin/HEAD` (fails when the repo had no remote); use a subagent with an explicit file list instead.
- `rm -f $VAR/*` is blocked by the safety check; use a literal path or `"${VAR:?}"/*`.
- Prisma `upsert` through the tenant scope is not atomic; do not rely on it for concurrency.

## Current state
Dev server may run on port 3000 and tunnels on 5433/5678/5050 (`npm run db:tunnel`, `npm run ui:tunnel`). Everything committed and pushed to `origin` (github.com/gabrielneto-dev/bumera) at the end of the session, including `deploy/infra/`, `AGENTS.md`, `package.json` (`ui:tunnel`) and this Context. The n8n MCP was registered locally afterwards (`n8n-mcp`, local scope, token not stored anywhere in the repo).

## Open questions
`CTX-QUE-20261021-n8n-mcp-access` (n8n MCP not configured yet), `CTX-QUE-20261018-app-deployment`, `CTX-QUE-20261016-service-auth` (partly answered), `CTX-QUE-20261018-email-provider`, pilot clinics, LLM in pilot.

## Next steps
1. Verify the n8n MCP tools in a new Claude session (registered as `n8n-mcp`, local scope).
2. Decide app deployment (Dockerfile/compose project under `~/bumera`, hostname, build memory).
3. M3: first n8n flow polling `/api/v1/reminders/due`, sending via Evolution, reporting results.
4. Remove the old stopped Bumera stack when the user confirms; back up `N8N_ENCRYPTION_KEY` and the CPF keys outside the server.
5. Consider two service keys + network restriction (`CTX-RSK-20261021-service-key-and-claim-races`).

## Files or artifacts affected
`app/**` (shell, pages), `components/**`, `lib/reminders/**`, `lib/services/{appointments,reminders}.ts`, `lib/service-auth.ts`, `lib/api-response.ts`, `app/api/v1/**`, `prisma/schema.prisma` + migration `20261021120000_m2_reminders`, `deploy/infra/**`, `AGENTS.md`, `package.json`, `.claude/launch.json`, `e2e/clinic-flow.spec.ts`, `tests/**`.

## Context records created or updated
Created: `CTX-FCT-20261021-server-infra-state`, `CTX-DEC-20261021-generic-shared-infra`, `CTX-DEC-20261021-reminders-consent-and-stale-guard`, `CTX-NTE-20261021-m2-implementation`, `CTX-NTE-20261021-ui-redesign`, `CTX-RSK-20261021-service-key-and-claim-races`, `CTX-QUE-20261021-n8n-mcp-access`. Updated: `CTX-FCT-20261017-server-inventory` (superseded), `CTX-QUE-20261016-service-auth`, `CTX-NTE-20261017-integration-contracts-draft`, `CTX-PLN-20261017-mvp-milestones`.
