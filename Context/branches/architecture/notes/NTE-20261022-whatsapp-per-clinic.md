---
id: CTX-NTE-20261022-whatsapp-per-clinic
type: note
title: WhatsApp por clínica: instância Evolution própria, envio e respostas isolados por clínica
branch: architecture
tags: [architecture, whatsapp, evolution-api, multi-tenancy, n8n, webhook]
status: active
confidence: high
created_at: 2026-10-22
updated_at: 2026-10-22
related: [CTX-NTE-20261021-m4-inbound-replies, CTX-NTE-20261021-clinic-settings, CTX-DEC-20261016-inbound-routing-app-first]
---

# One WhatsApp instance per clinic (commit c4345d1, migration 20261022120000_whatsapp_instance)

## Model
`clinic_settings.whatsappInstance` (nullable, UNIQUE): the clinic's Evolution API instance name (its WhatsApp number). Null = not connected. Name rule: 2-40 chars, lowercase letters, digits, `-`, `_`, starting with a letter or digit (`whatsappInstanceSchema`). Service `lib/services/whatsapp.ts`: `getWhatsappInstance`/`setWhatsappInstance` (admin only, error `DUPLICATE_WHATSAPP` when another clinic owns the name; saving does not touch the timings) and `hasWhatsappInstance` (any role, for the warning).

## Outbound
`GET /api/v1/reminders/due` items now carry `whatsapp: { instance }`; the n8n node "Enviar pela Evolution" builds its URL as `http://bumera-evolution:8080/message/sendText/{{ $json.whatsapp.instance }}` (edited and published in n8n on 2026-10-22; the repo export is `n8n/workflows/reminders-whatsapp.json`). A clinic without an instance: its reminders and replies are held (`dueAt` +30 min, status PENDING, no attempt consumed) and Pendentes shows a warning. Evolution webhook payloads name the instance in `instance`.

## Inbound
`parseEvolutionMessage` returns `instance` (payloads without it are ignored). The webhook route resolves the clinic with `clinicSettings.findUnique({whatsappInstance})` (unknown instance -> `UNKNOWN_INSTANCE`, acknowledged) and `handleInboundMessage` takes a `ClinicMessage` (`organizationId` required): the patient lookup, confirm, reschedule, campaign answers, opt-out and acknowledgements all stay inside that clinic. This changed an earlier rule: SAIR no longer opts the phone out of every clinic, only of the clinic whose number received it.

## Screen
`/whatsapp` (menu "WhatsApp", group "Clínica", admin only): instance name form and the connection state read from Evolution (`lib/evolution.ts` `getConnectionState`, read-only, 3 s timeout, never throws; needs `EVOLUTION_API_URL` and `EVOLUTION_API_KEY` in the app container, set in `deploy/compose.app.yml`). Verified in production: shows "Conectado" for `bumera-teste`.

## Operation
Adding a clinic: create the instance in Evolution, set its webhook (`POST /webhook/set/<name>`, never print the response), pair the QR code, then save the name on the WhatsApp screen: steps in `deploy/README.md`. Deploy order used for this change: backup, migrate, set the existing clinic's instance in the database, then restart the app, so no message was held. Tests: 476, ~96%; test helper `connectWhatsapp` gives a test clinic an instance.

## Not done
Creating the instance and showing the QR code from inside the app; per-clinic Evolution webhook setup is manual.
