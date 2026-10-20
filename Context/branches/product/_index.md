# Branch: product

Scope: modules, pricing, pilots, scheduling app features. Status: active.

## Modules
1 Reativação · 2 Follow-up de orçamento · 3 Confirmação/lembrete · 4 IA no WhatsApp (last, 3 paying clients).

## Decisions
`CTX-DEC-20261014-module-sequencing`, `CTX-DEC-20261016-webhook-triggers`, `CTX-DEC-20261016-pilot-first-module` (confirmação/lembrete first), `CTX-DEC-20261017-multi-dentist-calendar`, `CTX-DEC-20261017-roles`, `CTX-DEC-20261017-clinic-defined-reminders`, `CTX-DEC-20261017-patient-minimum-fields`, `CTX-DEC-20261017-pending-registration-no-duplicates`, `CTX-DEC-20261017-consent-and-opt-out`, `CTX-DEC-20261017-patient-duplicate-rules`, `CTX-DEC-20261017-default-trigger-timings`, `CTX-DEC-20261017-trigger-delivery-retries`

## Assumptions / plans
- Pricing: `CTX-ASM-20261014-pricing-baseline` (pilot ~R$50/mo; regular ~R$400 + ~R$200/mo)
- Pilots (1–3 clinics, feedback-based): `CTX-PLN-20261014-pilots`; clinic-profile research on demand: `CTX-PLN-20261017-pilot-clinic-research`
- Scheduling UI (part of app engine): `CTX-PLN-20261014-simple-scheduling-interface` (completed by M1)

## Done / next
M1 delivered (registry, agenda, team, on-screen e-mail, e2e): `CTX-PLN-20261020-m1-registry-and-agenda` (completed; follow-ups listed there). Next: M2 reminders (`CTX-PLN-20261017-mvp-milestones`).

## Open questions
`CTX-QUE-20261016-pilot-first-module-and-clinics` (which clinics), `CTX-QUE-20261016-llm-usage-in-pilot`

## Research
`CTX-RES-20261017-openrouter-model-shortlist` (LLM candidates, low confidence)

## Answered
`CTX-QUE-20261014-pilot-definition`, `CTX-QUE-20261014-clinic-data-source`, `CTX-QUE-20261016-trigger-catalog`, `CTX-QUE-20261016-calendar-model`, `CTX-QUE-20261016-patient-fields-and-whatsapp-registration`, `CTX-QUE-20261016-message-compliance-optout`.

Architecture: `../architecture/_index.md`.
