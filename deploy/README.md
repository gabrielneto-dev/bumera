# Deploy and M3 runbook

Prepared files: `Dockerfile`, `deploy/compose.app.yml`, `deploy/env.production.example`, `n8n/workflows/reminders-whatsapp.json`.
Nothing here has been applied to the server yet. Never print `.env` contents; only variable names are listed.

## 1. Secrets (on the server, appended to `~/bumera/.env`, mode 600)
Generate each value on the server and append without echoing it, e.g.
`printf 'SERVICE_API_KEY=%s\n' "$(openssl rand -hex 32)" >> ~/bumera/.env`
Needed: `BETTER_AUTH_SECRET` (hex 32), `SERVICE_API_KEY` (hex 32), `EVOLUTION_API_KEY` (hex 32),
`CPF_ENCRYPTION_KEY` and `CPF_HASH_KEY` (`openssl rand -base64 32` each, different values).
Back the two CPF keys up outside the repo and the server before any real patient data.

## 2. Databases
`docker exec bumera-postgres psql -U bumera -d bumera_dev -c 'CREATE DATABASE bumera_prod;'` and the same for `evolution`.

## 3. Ship the code and build
`rsync -a --exclude node_modules --exclude .next --exclude .git --exclude '.env*' ./ my-server:~/bumera/src/`
`scp deploy/compose.app.yml my-server:~/bumera/compose.app.yml`
On the server, one build at a time (RAM is ~3.7 GB; stop pgAdmin during the build if memory is short):
`cd ~/bumera && docker compose -f compose.yml -f compose.app.yml build app`
`docker compose -f compose.yml -f compose.app.yml --profile tools run --rm migrate`
`docker compose -f compose.yml -f compose.app.yml up -d app evolution redis`

## 4. Cloudflare
Dashboard: add a public hostname `bumera.gnslab.com.br` -> `http://localhost:3000` on the existing tunnel.
n8n and Evolution stay off the internet: n8n reaches them as `http://app:3000` and `http://evolution:8080`.

## 5. WhatsApp test number
Create the instance `bumera-teste` (Evolution API `POST /instance/create` with header `apikey`, via an SSH tunnel to 127.0.0.1:8080)
and scan the QR code with the test phone. Use a spare number: the API is unofficial (`CTX-RSK-20261014-whatsapp-unofficial-api`).

## 6. n8n
Open the n8n UI through the SSH tunnel (`npm run ui:tunnel`) and create two *Header Auth* credentials:
- `Bumera service key`: name `Authorization`, value `Bearer <SERVICE_API_KEY>`
- `Evolution API key`: name `apikey`, value `<EVOLUTION_API_KEY>`
Import `n8n/workflows/reminders-whatsapp.json`, link both credentials, test once manually, then activate.
Message copy comes from the app (`message`), and failures show on the app's Pendentes screen.
