---
id: CTX-DEC-20261017-multi-dentist-calendar
type: decision
title: Agenda suporta de 1 a N dentistas por clínica
branch: product
tags: [calendar, scheduling]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261016-three-engines, CTX-DEC-20261016-saas-multi-tenant]
---

# Decision
A clinic can have from 1 to N dentists; the calendar/scheduling model must support multiple dentists with their own schedules. The user does not know what a typical clinic agenda looks like, so details (working hours, breaks, procedure durations, rooms) will be learned from the pilot clinics.
