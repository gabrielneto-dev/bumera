---
id: CTX-CP-20261017-1550-questionnaire-round-3
type: checkpoint
title: Questionário rodada 3: cadastro, pendências, consentimento e acesso
branch: global
tags: [pilot, architecture]
status: active
created_at: 2026-10-17
updated_at: 2026-10-17
---

# Session Checkpoint

## Objective
Persist round 3 answers.

## What changed
Decisions: patient minimum fields, pending WhatsApp registrations with no duplicates, consent + opt-out. Answered: patient-fields-and-whatsapp-registration, message-compliance-optout. Partial: home-server-exposure-backups (Cloudflare Tunnel + own domain in use). New question: patient-duplicate-rules.

## Open questions
patient-duplicate-rules, backups/monitoring, auth login method, service-auth, trigger-catalog details, llm-usage-in-pilot, pilot clinics.

## Next steps
Round 4 (chat): duplicate rules, backups, login method, service auth between app and n8n. Then data model draft.
