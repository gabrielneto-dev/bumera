# Deploy and M3 runbook

Applied on 2026-10-21. Server layout: shared stack `~/infra` (Postgres, pgAdmin, n8n; docker network `infra`) and the Bumera stack in `~/bumera-app` (`app`, `evolution`, `redis`). The old `~/bumera` stack is stopped and kept only as a backup.
Files: `Dockerfile`, `deploy/compose.app.yml` (copied to `~/bumera-app/compose.yml`), `deploy/env.production.example`, `n8n/workflows/reminders-whatsapp.json`.
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
Import `n8n/workflows/reminders-whatsapp.json`, link both credentials, run it once manually, then activate.

## Worker and the WhatsApp sender switch (AI F1)
The `worker` service (`bumera-worker`, `Dockerfile` target `worker`) runs pg-boss queues in the `pgboss` schema of `bumera_prod` (created on first start). `WHATSAPP_SENDER` in `~/bumera-app/.env` decides who buffers inbound messages and sends WhatsApp messages; the app and the worker read the same value:
- `n8n` (default): the webhook buffers with `INBOUND_BUFFER_MS`, the n8n workflow polls `/api/v1/reminders/due` and sends. The worker consumes nothing.
- `worker`: the webhook stores the message and schedules the number's turn; the worker answers it, dispatches due messages every minute and right after each turn, and sends them through Evolution with pacing. `/due` then hands out nothing, so a workflow left active cannot send twice.

Switch to the worker (after `docker compose build app worker` and the migration):
1. Set `WHATSAPP_SENDER=worker` in `~/bumera-app/.env`.
2. `docker compose up -d app worker`; check `docker compose ps` (worker healthy) and `docker logs bumera-worker` (JSON lines; `worker.started` lists the queues).
3. Deactivate the n8n workflow "Bumera - Lembretes por WhatsApp" (`n8n update:workflow --id=7msgAcP3Ptnh5r9r --active=false` inside `infra-n8n`, or in the editor).
4. Send "oi" and "1" from a test phone to `bumera-teste`; the answer should arrive in about 10 s.

Back to n8n: set `WHATSAPP_SENDER=n8n`, `docker compose up -d app worker`, reactivate the workflow. Messages buffered for the worker are then answered by the next `/due` poll. Run one worker replica only.

## Adding a clinic (one WhatsApp number per clinic)
Each clinic has its own Evolution instance; its name is saved on the app's **WhatsApp** screen (admin only) and is unique across clinics. Until it is set, that clinic's messages wait (they are checked again every 30 minutes) and Pendentes shows a warning.
1. Create the instance (header `apikey`, from inside the Evolution container or through an SSH tunnel to 127.0.0.1:8080): `POST /instance/create` with `{"instanceName":"<name>","qrcode":true,"integration":"WHATSAPP-BAILEYS"}`.
2. Point its webhook at the app: `POST /webhook/set/<name>` with `{"webhook":{"enabled":true,"url":"http://bumera-app:3000/api/webhooks/evolution/<EVOLUTION_WEBHOOK_TOKEN>","events":["MESSAGES_UPSERT"],"webhookByEvents":false,"webhookBase64":false}}`. Never print the response: it echoes the secret URL.
3. Pair the clinic's phone with the QR code (`GET /instance/connect/<name>`).
4. In the app, as the clinic's admin, open **WhatsApp** and save the same name; the screen shows the connection state.
The n8n workflow needs no change per clinic: the app tells it which instance to use for every message (`whatsapp.instance`), and inbound messages find their clinic by the instance that received them.

