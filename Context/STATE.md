# Project State

Last updated: 2026-10-21
Latest checkpoint: Context/checkpoints/CP-20261021-1600-clinic-settings.md

## Current objective
Ship the pilot: confirmação/lembrete over WhatsApp for 1–3 dental clinics (modules 1–3, no AI), hosted on the user's server. M4 (inbound replies and hardening) in progress.

## Working (built, tested, committed through 98da1eb)
- Next.js 16 app with Better Auth (multi-tenant clinics, roles, invitations, on-screen e-mail codes); registry and agenda (patients with encrypted CPF, dentists, procedures, appointments with no-overlap, pending queue).
- M2: `reminder` table recomputed with appointment changes, `GET /api/v1/reminders/due` and `POST .../result` (Bearer service key), failed reminders on Pendentes.
- M3: deployed on the server in `~/bumera-app` (app, Evolution v2.3.7, Redis) over the shared `~/infra` stack (Postgres, pgAdmin, n8n); app at `bumera.gnslab.com.br`; WhatsApp test instance `bumera-teste` paired; n8n workflow "Bumera - Lembretes por WhatsApp" published (every 5 min) and verified end to end with a real message.
- Quality: unit/integration tests plus one Playwright e2e; typecheck, lint, build pass. Details: `CTX-NTE-20261021-m2-m3-implementation`, `CTX-NTE-20261020-m1-implementation`.

- M4 slice 1: Evolution webhook -> app (secret in URL), replies 1 (confirm), 2 (reschedule request, shown on Pendentes), SAIR (opt-out for every record of the phone), automatic answers through `REPLY_*` reminder kinds, structured WhatsApp messages (paragraphs, bold, emojis), auto-refresh of Agenda/Pendentes; 320 tests, ~96% coverage; verified with a real phone. Details: `CTX-NTE-20261021-m4-inbound-replies`.

- Patient screen: "Permitir mensagens" (explicit consent recorded) reactivates an opted-out patient. Backups: daily `pg_dump` of `bumera_prod` and `evolution` on the server (`deploy/backup.sh`, cron 03:30 UTC, 14 days). LGPD checklist: `CTX-NTE-20261021-lgpd-checklist`.

- Module 1 (reactivation: per-procedure return invitation) and module 2 (quotes: Orçamentos screen, follow-ups at day 2 and 7, expiry at 14 days), both with replies 1/2 and Pendentes follow-up; module 1 verified on the owner's phone too. Details: `CTX-NTE-20261021-modules-1-2-reactivation-quotes`, rules `CTX-DEC-20261021-reactivation-and-quotes-rules`. 409 tests.

- Per-clinic message timings: admin-only Mensagens screen (confirmation, two reminders, no-show invite, quote follow-up days and validity) with live re-planning of unsent reminders. `CTX-NTE-20261021-clinic-settings`.

## Not built yet
Editable message texts and quiet hours, module 4 (AI, last), off-machine encrypted backup copy, webhook setup for new Evolution instances (manual today), audit log and patient data export/deletion, protection of public n8n/Evolution hostnames, LGPD checklist, e-mail provider, password reset, cleaning test data in `bumera_prod` (Gabriel Teste, Teste Falha).

## Blockers
None.

## Active decisions (full lists in the branch indexes)
Three engines (app, n8n, Evolution) · app owns the DB (PostgreSQL) · Next.js + Tailwind + shadcn/ui · n8n polls the app for reminders · app on the shared infra, `~/bumera-app` (`CTX-DEC-20261021-shared-infra-app-deployment`; never touch `~/infra` without the user's say) · e-mail shown on screen for now · modules 1–3 first, AI last · pilot with 1–3 clinics at ~R$50/month (not final) · backups deferred to first client; n8n and Evolution temporarily public (accepted/open risks).

## Open questions
`CTX-QUE-20261016-service-auth` (partly answered) · `CTX-QUE-20261016-llm-usage-in-pilot` · `CTX-QUE-20261016-pilot-first-module-and-clinics` · `CTX-QUE-20261018-email-provider` (postponed). Risk: `CTX-RSK-20261021-evolution-publicly-exposed`.

## Next likely steps
0. Module 4 (AI) or the end-of-project items (e-mail, password reset, off-machine backup: the user wants these at the end).
1. Protect the Evolution hostname (Cloudflare Access) and keep the CPF key copies off the server (owner actions).
2. Off-machine encrypted backup copy; audit log; real e-mail provider and password reset.
3. Put the Evolution hostname behind Cloudflare Access; back up the CPF keys off the server.
3. Clean test data in `bumera_prod` before real clinics; backups last.
