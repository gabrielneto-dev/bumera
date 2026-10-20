---
id: CTX-FCT-20261017-server-inventory
type: fact
title: Inventário do servidor (ssh my-server) em 2026-10-17
branch: architecture
tags: [hosting, infrastructure]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261016-self-hosted-home-server]
---

# Server inventory (observed 2026-10-17, read-only)

Access: `ssh my-server` (user in groups sudo and docker). Used for development AND production, including the pilot (user decision).

- OS Ubuntu 24.04, 4 vCPU, 3.7 GB RAM + 3.7 GB swap, ~20 GB free disk. RAM is tight.
- Docker 29 + Compose v5 installed. Host Node is v18 (too old; run Node inside containers). No psql/nginx/caddy on host.
- Running: `n8n` (127.0.0.1:5678, compose in ~/docker/n8n, volume n8n_data) and `flip-radar-scraper` (other project).
- Stopped stacks with their own compose files in ~/docker: `postgres` (postgres:16 on 127.0.0.1:5432, volume postgres_data, contents unknown), `evolution` (evolution-api + redis, 127.0.0.1:8080; exited with error 11 days ago), `pgadmin`, and DeskcommCRM containers (another project).
- Cloudflare Tunnel runs as root (`cloudflared tunnel run --token-file ...`); hostnames are managed in the Cloudflare dashboard, not in a readable local file.
- `.env` files exist per stack and were deliberately not read.

## Implications
Bumera should get its own compose project/directory and its own Postgres; the host Node version is irrelevant if the app runs in a container; builds must be memory-conscious. Existing n8n is the likely n8n engine (decision pending: shared vs dedicated).

## Hardware and health (observed 2026-10-18, read-only)
- CPU Intel Core i3-2100 (2011, 2 cores/4 threads, VT-x), Gigabyte H61M-DS2 board, BIOS (legacy) boot, ~3.7 GB RAM, one gigabit NIC (atl1c), no UPS/battery detected.
- Disks: 120 GB SSD (OS, LVM: PV ~110 GB but root LV only ~55 GB, so likely ~55 GB unallocated, to confirm with `sudo vgs`) and a 500 GB 2.5" spinning HDD (ST9500325AS) formatted NTFS, unmounted, contents unknown. SMART health not checked (needs sudo).
- Boot target is `graphical.target` (desktop config on a server); several reboots in October (kernel updates likely); no failed systemd units; unattended-upgrades enabled. Firewall and SSH password-auth status not verified (needs sudo).
- Docker data: images ~19 GB; named volumes total ~245 MB (n8n_data holds workflows and credentials; evolution volumes hold WhatsApp sessions).
- Discussion 2026-10-18: user considered wiping the server for Proxmox. Agent assessment: not recommended on this hardware (RAM); reinstall of Ubuntu not required either. Decision pending from the user.

## Update 2026-10-18
All Docker workloads were removed at the user's request; see `CTX-DEC-20261018-no-proxmox-clean-server`. The inventory above describes the server BEFORE the cleanup. After: no containers, volumes, images; RAM use ~0.55 GB; disk 12 GB of 54 GB used.
