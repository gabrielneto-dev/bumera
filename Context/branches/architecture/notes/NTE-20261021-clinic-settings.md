---
id: CTX-NTE-20261021-clinic-settings
type: note
title: Horários de mensagens configuráveis por clínica (tela Mensagens): modelo, regras e operação
branch: architecture
tags: [architecture, triggers, product-modules, scheduling]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-DEC-20261017-clinic-defined-reminders, CTX-NTE-20261021-modules-1-2-reactivation-quotes, CTX-NTE-20261021-m2-m3-implementation]
---

# Clinic settings (commit 98da1eb, migration 20261021190000_clinic_settings)

## Model and defaults
`clinic_settings`: one row per clinic (primary key `organizationId`, tenant model `ClinicSettings`), created on first save; no row = `DEFAULT_CLINIC_SETTINGS` in `lib/reminders/settings.ts` (the timings the pilot started with). Fields: `confirmationEnabled`; `reminder1Enabled/HoursBefore` (24, asks unconfirmed patients to confirm, kind `REMINDER_24H`); `reminder2Enabled/HoursBefore` (2, everybody, kind `REMINDER_2H`); `noShowEnabled/DelayHours` (1); `quoteFollowup1Days` (2), `quoteFollowup2Days` (7), `quoteValidDays` (14). The kind names `REMINDER_24H`/`REMINDER_2H` are historical: they mean "1st/2nd reminder" now. DB CHECK keeps the ranges (1-168 h, no-show 1-72 h, follow-ups 1-30/1-60 days, validity 1-90).

## Rules
- Validation (`clinicSettingsSchema`): the 1st reminder must be earlier than the 2nd when both are on; the 2nd quote contact after the 1st; validity covers the 2nd contact.
- `planReminders`/`planQuoteReminders`/`syncReminders`/`syncQuoteReminders`/`evaluateQuoteGuard` take the settings (optional, default = defaults). Services load them with `loadClinicSettings(ctx)`; the inbound handler and `lib/reminders/dispatch.ts` read the table directly (validity per clinic for quote follow-ups and their retry deadline).
- `updateSettings` (admin only, resource `triggerRule`) upserts and then re-plans unsent reminders: upcoming SCHEDULED/CONFIRMED appointments, NO_SHOW of the last 24 h, OPEN quotes. Sent reminders are never rewritten. For quotes only future follow-ups that the plan no longer wants are cancelled; one already due is left for n8n.
- Message texts no longer say "amanhã"/"hoje": they carry the real date and time.
- Reactivation stays per procedure (`procedure.reactivateAfterMonths`), not in this screen. Message wording and reply keywords are not configurable.

## UI
`/mensagens` (menu "Mensagens", group "Clínica"), `app/(app)/mensagens/{page,actions,settings-form}`. Non-admins see a notice. Verified on 2026-10-21 in production: defaults shown, validation message for an invalid order, saving moved an unsent quote follow-up (+7 to +8 days) while the sent one stayed; settings were restored to the defaults afterwards.

## Not done
Editing the message texts, per-procedure reminder timings, quiet hours (no sending at night) and a daily sending limit.
