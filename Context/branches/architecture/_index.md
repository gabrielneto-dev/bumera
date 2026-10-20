# Branch: architecture

Scope: engines, stack, hosting, data, security. Status: active — direction decided, details open.

## Decided
- Three engines: app (Next.js, front+back in one project), n8n, Evolution API (separate server) — `CTX-DEC-20261016-three-engines`
- DB single owner = app backend — `CTX-DEC-20261016-single-db-owner`
- Next.js + Tailwind + shadcn/ui, n8n — `CTX-DEC-20261016-stack-nextjs-n8n`
- SaaS multi-tenant — `CTX-DEC-20261016-saas-multi-tenant`
- PostgreSQL — `CTX-DEC-20261016-postgresql`
- Inbound WhatsApp: Evolution → app → n8n (verify) — `CTX-DEC-20261016-inbound-routing-app-first`
- Auth e-mail/password + invites — `CTX-DEC-20261017-auth-email-password-invites`
- Backups deferred — `CTX-DEC-20261017-defer-backups`; phased network exposure — `CTX-DEC-20261017-network-exposure-phased`
- No Proxmox, clean server — `CTX-DEC-20261018-no-proxmox-clean-server`
- E-mail delivered on screen for now — `CTX-DEC-20261020-email-on-screen`
- Home-server hosting — `CTX-DEC-20261016-self-hosted-home-server`

## Server and code
Server inventory: `CTX-FCT-20261017-server-inventory`. Code map and conventions: `CTX-NTE-20261020-m1-implementation` (read first when changing code).

## Plan and drafts
Approved: `CTX-DEC-20261017-mvp-simplified`, `CTX-PLN-20261017-mvp-milestones` (M0, M1 done). Reference drafts (annotated with adjustments): `CTX-NTE-20261017-data-model-draft`, `CTX-NTE-20261017-integration-contracts-draft`. Superseded: `CTX-PLN-20261017-build-milestones`, `CTX-DEC-20261020-invite-codes-no-email` (misread; replaced by on-screen e-mail).

## Implementation
`CTX-NTE-20261018-m0-implementation` (what exists, how it was verified, gotchas). 

## Risks
`CTX-RSK-20261014-whatsapp-unofficial-api`, `CTX-RSK-20261014-lgpd-patient-data`, `CTX-RSK-20261016-home-server-availability`

## Open questions
`CTX-QUE-20261016-service-auth`, `CTX-QUE-20261018-app-deployment`, `CTX-QUE-20261018-email-provider` (postponed)

## Superseded / answered
`CTX-ASM-20261014-stack-candidates` (superseded), `CTX-QUE-20261014-stack-final`, `CTX-QUE-20261014-whatsapp-integration-approach` (answered).

Product side: `../product/_index.md`.
