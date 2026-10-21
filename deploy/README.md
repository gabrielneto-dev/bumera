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
