---
id: CTX-RES-20261025-evolution-webhook-contract
type: research
title: Contrato do webhook do Evolution API (documentado, ainda não capturado)
branch: ai-agent
tags: [evolution-api, webhook, whatsapp]
status: active
confidence: medium
created_at: 2026-10-25
updated_at: 2026-10-25
source_ids: []
related: [CTX-QUE-20261025-evolution-webhook-contract]
---

## Question investigated
What the Evolution webhook sends and how to authenticate it, to design the Phase 1 ingress.

## Scope & date
Docs/community pages and the GitHub releases page, 2026-10-25. No real payload captured yet (Evolution is not installed on the server).

## Sources
github.com/EvolutionAPI/evolution-api/releases; mintlify mirror of the Evolution docs (events/webhooks); GitHub issue evolution-foundation/evolution-api#1340.

## Findings
- **Version:** latest stable v2.3.7. 2.4.0 is a release candidate that makes **license activation mandatory** (breaking for API traffic) → pin v2.3.7.
- **Config:** `POST /webhook/set/{instance}` with `webhook: { enabled, url, byEvents, base64, headers, events[] }`; `GET /webhook/find/{instance}` to read it. `byEvents: false` sends every event to one URL; `true` appends the event name to the path.
- **Auth:** `headers` are sent with every webhook call → use a per-instance secret header and compare in constant time. The body also carries the instance `apikey`: never log or persist the raw payload.
- **Envelope:** `event`, `instance`, `data`, `destination`, `date_time`, `sender`, `server_url`, `apikey`. Config uses `MESSAGES_UPSERT`, payload uses `messages.upsert`.
- **Message:** `data.key { remoteJid, fromMe, id }`, `message`, `messageTimestamp`, `pushName`. Our own sends may arrive as `messages.upsert` with `fromMe: true` (not `send.message`) → match against `SendLedger` by provider id to tell system echo from a staff message typed on the phone.
- Events to subscribe: `MESSAGES_UPSERT`, `MESSAGES_UPDATE` (delivery/read), `SEND_MESSAGE`, `CONNECTION_UPDATE`, possibly `PRESENCE_UPDATE` (needs verification; adaptive debounce works without it).

## Limitations
Docs are community mirrors; field shapes must be confirmed with captured payloads.

## Implications
- Ingress validates a header secret, parses with a permissive Zod schema (unknown fields allowed), dedups by `data.key.id`, ignores `@g.us` groups and `status@broadcast`.
- **Risk to verify:** recent WhatsApp versions may address contacts by LID (`...@lid`) instead of the phone number; matching patients by phone must use whatever phone field the payload provides. Capture before building the patient match.
