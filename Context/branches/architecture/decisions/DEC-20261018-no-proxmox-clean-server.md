---
id: CTX-DEC-20261018-no-proxmox-clean-server
type: decision
title: Sem Proxmox; servidor limpo de cargas antigas, Ubuntu + Docker mantidos
branch: architecture
tags: [hosting, infrastructure]
status: active
confidence: high
created_at: 2026-10-18
updated_at: 2026-10-18
related: [CTX-FCT-20261017-server-inventory, CTX-DEC-20261017-mvp-simplified]
---

# Decision
- Proxmox rejected for this hardware (i3-2100, ~4 GB RAM): the hypervisor reserve (~2 GB) leaves too little for the stack, and it adds maintenance without solving the real risks (single machine, no UPS, no backups). Ubuntu reinstall is not needed either. Agent analysis recorded in `CTX-FCT-20261017-server-inventory`.
- On 2026-10-18 the user asked to remove everything running on the server. Done: all containers, volumes, networks, images and build cache removed (n8n, Evolution, Postgres, pgAdmin, flip-radar, DeskcommCRM); `~/docker` stack folders removed. Ubuntu and Docker/Compose kept; the Cloudflare tunnel service and the other host services/folders in the home directory were not touched.
- Safety copy kept on the server at `~/backup-pre-limpeza-20261018` (compose/source folders and volume archives, integrity-checked). Not preserved: flip-radar browser-profile cache (~1 GB, root-owned files). Volume archives are root-owned; deleting them needs sudo.

## Consequences
The previously running n8n no longer exists: Bumera gets its own n8n and Postgres (and Evolution at M3) in a Bumera compose project, which resolves the earlier "shared vs dedicated n8n" question in favor of dedicated. Public hostnames still configured in the Cloudflare dashboard now point at nothing.
