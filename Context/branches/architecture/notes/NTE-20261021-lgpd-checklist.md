---
id: CTX-NTE-20261021-lgpd-checklist
type: note
title: Checklist de LGPD do piloto: o que o sistema já faz e o que falta (não é parecer jurídico)
branch: architecture
tags: [lgpd, privacy, security, data]
status: active
confidence: medium
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-RSK-20261014-lgpd-patient-data, CTX-NTE-20261021-m4-inbound-replies, CTX-QUE-20261021-opt-out-reactivation]
---

# LGPD checklist (engineering view, state at commit c461acf)
This lists technical controls. Legal items need a lawyer before paid clients (`CTX-RSK-20261014-lgpd-patient-data`).

## Already in place
- **Minimum data:** name, phone, optional CPF and birth date; no clinical records.
- **CPF protection:** AES-256-GCM at rest, keyed hash for uniqueness, masked in the UI; keys in env vars (copies kept by the owner outside the repo).
- **Tenant isolation:** `scopedPrisma` plus composite foreign keys at the database level; isolation tests.
- **Consent and opt-out:** consent flag and time stored at registration (`consentAt`, `consentSource`); no message goes to a patient without it; reply SAIR opts out every record of the phone number, stops pending reminders and is acknowledged once; a secretary can allow messages again only with a recorded new consent (`allowMessagesAgain`).
- **Message content:** fixed templates, sanitized names, failure notes never hold phone numbers or text.
- **Access control:** roles admin/secretary/dentist, e-mail verification, service key and webhook secret compared in constant time, 503 when a secret is not configured.
- **Transport:** public hostnames sit behind the Cloudflare Tunnel (HTTPS); service-to-service traffic stays on the private docker network.
- **Backups:** daily `pg_dump` of `bumera_prod` and `evolution` to `~/backups/bumera` (mode 600, 14 days, listed after each dump) on the same server (`deploy/backup.sh`, cron 03:30 UTC).

## Closed on 2026-10-22 (see `CTX-NTE-20261022-lgpd-audit-export-erasure`)
Activity log (append-only, no personal values), export of a patient's data, erasure by anonymization. Rows below that mention them as gaps are superseded.

## Gaps (open)
- Backups stay on the same machine and are not encrypted: add an off-machine encrypted copy before real patient data.
- Evolution and n8n hostnames are public (`CTX-RSK-20261021-evolution-publicly-exposed`).
- Reads of patient data are not logged; no retention policy; Evolution keeps its own copy of contacts and conversations that the erasure does not reach.
- No privacy notice, processor agreement (clinic = controller, Bumera = processor) or consent wording reviewed by a lawyer.
- WhatsApp access is through an unofficial API (`CTX-RSK-20261014-whatsapp-unofficial-api`); WhatsApp conversations are also stored by the Evolution database.
- Password reset and real e-mail delivery do not exist (on-screen codes only).
- Row level security in the database is planned but not done.
