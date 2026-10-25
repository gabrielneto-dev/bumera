---
id: CTX-QUE-20261018-app-deployment
type: question
title: Como e quando publicar o app no servidor (Dockerfile, Compose, hostname)?
branch: architecture
tags: [hosting, architecture]
status: answered
created_at: 2026-10-18
updated_at: 2026-10-21
related: [CTX-DEC-20261018-no-proxmox-clean-server]
---

## Question
M0 runs locally against the server's dev database. How will the app run on the server for the pilot: Docker image built on the server (RAM is tight, ~3.7 GB) or built elsewhere and shipped; which hostname in the Cloudflare tunnel; separate dev and prod stacks and databases (`bumera_prod`)?

## What depends on the answer
Pilot readiness (M5), n8n/Evolution wiring (M3), env/secrets handling in production, https `BETTER_AUTH_URL`.

## How to resolve
Decide before M3. Agent proposal: Dockerfile with standalone output built on the server with limited memory, a `prod` compose project beside `dev`, hostname chosen by the user in the Cloudflare dashboard.

## Answer (2026-10-21)
Answered by `CTX-DEC-20261021-shared-infra-app-deployment`: app image built on the server, project `~/bumera-app` on the shared `infra` network, `bumera_prod` database, hostname `bumera.gnslab.com.br`.
