---
id: CTX-CP-20261018-1311-server-cleanup
type: checkpoint
title: Sem Proxmox e limpeza do servidor
branch: global
tags: [hosting]
status: active
created_at: 2026-10-18
updated_at: 2026-10-18
---

# Session Checkpoint

## What changed
Proxmox discarded; server cleaned of all Docker workloads after a verified backup; AGENTS.md operating rule updated; decision recorded.

## Current state
Clean Ubuntu + Docker server (`ssh my-server`). M0 about to start. Existing n8n is gone; Bumera will run its own.

## Next steps
Create `~/bumera` compose project (Postgres first), scaffold the Next.js app locally (Node 24), DB via SSH tunnel; M0 test-first. User must re-create any Cloudflare hostname for the app.
