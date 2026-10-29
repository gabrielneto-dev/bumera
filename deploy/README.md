# Deploy and M3 runbook

Applied on 2026-10-21. Server layout: shared stack `~/infra` (Postgres, pgAdmin, n8n; docker network `infra`) and the Bumera stack in `~/bumera-app` (`app`, `evolution`, `redis`). The old `~/bumera` stack is stopped and kept only as a backup.
Files: `Dockerfile`, `deploy/compose.app.yml` (copied to `~/bumera-app/compose.yml`), `deploy/env.production.example`, `n8n/workflows/reminders-v2.json`.
Never print `.env` contents; only variable names are listed.

## Update the app
```
rsync -a --delete --exclude node_modules --exclude .next --exclude .git --exclude '.env*' --exclude generated --exclude .claude --exclude Context ./ my-server:~/bumera-app/src/
scp deploy/compose.app.yml my-server:~/bumera-app/compose.yml
ssh my-server 'cd ~/bumera-app && docker compose build app && docker compose --profile tools run --rm migrate && docker compose up -d app'
```
Builds use `network: host` because BuildKit's default resolver fails on this server. Build one image at a time (RAM ~3.7 GB).

## Databases and secrets
`bumera_prod` belongs to the `bumera` role; `evolution` was created with `~/infra/scripts/new-db.sh evolution`. Secrets live in `~/bumera-app/.env` (mode 600) and in the owner's password vault; the two CPF keys must also be backed up off the server.

## Hostnames (Cloudflare Tunnel)
`bumera.gnslab.com.br` -> `http://localhost:3000`. Evolution and n8n are reached by n8n as `http://bumera-evolution:8080` and `http://bumera-app:3000`.

## WhatsApp test number
Instance `bumera-teste` (Baileys), paired by QR code through the Evolution API (`POST /instance/create`, header `apikey`). The API is unofficial (`CTX-RSK-20261014-whatsapp-unofficial-api`): use a spare number.

## n8n
Create two *Header Auth* credentials: `Bumera service key` (name `Authorization`, value `Bearer <SERVICE_API_KEY>`) and `Evolution API key` (name `apikey`, value `<EVOLUTION_API_KEY>`).
Import `n8n/workflows/reminders-v2.json` and `n8n/workflows/inbound.json` into the `bumera` folder, link both credentials, run them once manually, then publish.
The inbound workflow also needs the data table `bumera_entrada_bloco` (columns `instance`, `phone`, `messageId`, `command`, all strings) and a random webhook path: the repository copy has it redacted (`<segredo: veja o nó no n8n>`), so set one on its "Evolution chamou" node before publishing.
Those files are the reviewed copies of the live workflows; `tests/n8n-workflows/*.test.ts` run them against the app's real routes. After changing a workflow in n8n, export it again (`docker exec infra-n8n n8n export:workflow --id=<id> --output=/tmp/wf.json`), keep only `id`, `name`, `description`, `versionId`, `nodes`, `connections` and `settings` (and redact the inbound webhook path), and run the tests.

## WhatsApp conversations live in n8n
Since 2026-10-26 (`CTX-DEC-20261026-whatsapp-in-n8n`) the app has no WhatsApp code: no webhook, no buffer, no AI. n8n workflows talk to patients through Evolution and call the app's API with the `Bumera service key` credential (reference: `docs/n8n-whatsapp-api.md`):
- reminders: `GET /api/v1/reminders/due` + `POST /api/v1/reminders/{id}/result` (workflow "Bumera - Lembretes por WhatsApp (v2)", which holds the message texts, one node per kind);
- inbound (workflow "Bumera - Entrada do WhatsApp"): replies 1, 2 and SAIR through `/answers`, messages in a row joined for 8 s;
- conversation: `/api/v1/clinics/by-instance/{instance}`, `/clinics/{id}/contact`, `/answers` (1, 2, SAIR), `/procedures`, `/slots`, `/booking-requests`.
The Evolution webhook of each instance must point at the n8n inbound workflow, not at the app.

## Adding a clinic (one WhatsApp number per clinic)
Each clinic has its own Evolution instance; its name is saved on the app's **WhatsApp** screen (admin only) and is unique across clinics. Until it is set, that clinic's messages wait (they are checked again every 30 minutes) and Pendentes shows a warning.
1. Create the instance (header `apikey`, from inside the Evolution container or through an SSH tunnel to 127.0.0.1:8080): `POST /instance/create` with `{"instanceName":"<name>","qrcode":true,"integration":"WHATSAPP-BAILEYS"}`.
2. Point its webhook at the n8n inbound workflow: `POST /webhook/set/<name>` with `{"webhook":{"enabled":true,"url":"http://infra-n8n:5678/webhook/<path of the inbound workflow's webhook node>","events":["MESSAGES_UPSERT"],"webhookByEvents":false,"webhookBase64":false}}`. Never print the response: it echoes the URL. Evolution reaches n8n over the `infra` network, so the internal URL is used.
3. Pair the clinic's phone with the QR code (`GET /instance/connect/<name>`).
4. In the app, as the clinic's admin, open **WhatsApp** and save the same name; the screen shows the connection state.
The n8n workflows need no change per clinic: `/due` says which instance sends each reminder (`whatsapp.instance`), and an inbound message finds its clinic with `/api/v1/clinics/by-instance/{instance}`.

