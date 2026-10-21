---
id: CTX-RSK-20261021-service-key-and-claim-races
type: risk
title: Chave de serviço única, GET que reserva lembretes, janela de cancelamento durante o envio e n8n público
branch: architecture
tags: [security, n8n, api, reminders, hosting]
status: open
confidence: medium
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261021-m2-implementation, CTX-DEC-20261017-network-exposure-phased, CTX-QUE-20261016-service-auth]
---

# Risks left after the M2 security review (no CRITICAL/HIGH found)
1. **One shared bearer key** (`SERVICE_API_KEY`) reaches every clinic's reminders (name, phone, appointment) and can mark reminders sent/failed. No rotation, no IP restriction, no rate limit. Mitigation ideas: two keys for rotation, restrict to the server network, HMAC + timestamp (deferred by `CTX-DEC-20261017-mvp-simplified`).
2. **`GET /reminders/due` mutates state** (claims rows), per the MVP polling decision; prefetchers/proxies could trigger it. Could become `POST /claim`.
3. **Cancel-while-claimed window:** if an appointment is cancelled in the seconds after n8n claimed its reminder, the message can still go out; n8n learns the final status only from the result call.
4. **n8n is public** at `n8n.gnslab.com.br` (login only); the first visitor to a fresh instance could claim the owner account, and the MCP endpoint is also public (token-protected). Accepted temporarily by `CTX-DEC-20261017-network-exposure-phased`.
5. **Message injection** is mitigated by `sanitizeName`; clinic/procedure names are user-typed and must keep going through it.

## When to revisit
Before the first real clinic uses it, and when the n8n flow (M3) is written.
