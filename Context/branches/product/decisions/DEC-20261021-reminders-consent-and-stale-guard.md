---
id: CTX-DEC-20261021-reminders-consent-and-stale-guard
type: decision
title: Lembretes só saem para paciente com consentimento e cadastro confirmado, e nunca obsoletos (escolha do agente, a revisar)
branch: product
tags: [triggers, reminders, lgpd, whatsapp, privacy]
status: active
confidence: medium
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-DEC-20261017-consent-and-opt-out, CTX-DEC-20261017-trigger-delivery-retries, CTX-DEC-20261017-default-trigger-timings, CTX-NTE-20261021-m2-implementation]
---

# Decision (agent-chosen defaults in M2; user has not reviewed them)
- **Consent required:** a reminder is skipped (`SKIPPED`) if the patient has no recorded consent (`consentAt`), is marked do-not-contact, or has a registration still pending. Rationale: `CTX-DEC-20261017-consent-and-opt-out` says do-not-contact must be honored and consent recorded; the patient form has an explicit consent checkbox.
- **Never stale:** at hand-off time a reminder is cancelled if the appointment is cancelled/completed/no-show/pending, already started, or (no-show follow-up) older than 24 h.
- **Reminder kinds and timings (defaults from `CTX-DEC-20261017-default-trigger-timings`):** CONFIRMATION (now, when booked), REMINDER_24H, REMINDER_2H (only if still in the future when planned), NO_SHOW_FOLLOWUP (1 h after the slot). Once the patient confirms, only the 2 h reminder remains.
- **Retries:** 5 attempts, waits 1 min / 5 min / 30 min / 2 h (the 6 h value of the draft is never reached because the 5th failure ends it), never past the appointment start; then `FAILED` and the secretary sees it on the Pendentes screen ("Mensagens que não saíram") with the patient's phone.
- **Message texts:** fixed pt-BR templates rendered by the app (not n8n); names are sanitized (no links, formatting or new lines).

## Open
Message wording and consent capture moment remain open (see `CTX-DEC-20261017-consent-and-opt-out`). Revisit if the user wants reminders without explicit consent for the pilot.
