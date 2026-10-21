---
id: CTX-NTE-20261021-ui-redesign
type: note
title: Redesenho da interface: convenções do novo shell, componentes compartilhados e como validamos
branch: architecture
tags: [ui, architecture, nextjs]
status: active
confidence: high
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-NTE-20261020-m1-implementation, CTX-DEC-20261016-stack-nextjs-n8n]
---

# UI redesign (commits 430ffac, d75bfa2, f4394f3; pushed to GitHub `gabrielneto-dev/bumera`)

## Direction
Clean, intuitive clinic UI: **left sidebar** (shadcn `Sidebar`, collapsible to icons with Ctrl/Cmd+B, sheet on mobile, state kept in the `sidebar_state` cookie), groups Rotina / Cadastros / Clínica filtered by role; dark teal sidebar as the anchor; light cool surface; Fraunces for titles, Geist for UI. Motion via the `motion` package (page transition, staggered rows) respecting reduced-motion. Dark mode toggle in the sidebar footer (class `dark`, saved in `localStorage`, applied by an inline script in the root layout before first paint; follows the OS on first visit).

## Where things are
Shell: `app/(app)/layout.tsx`, `app-sidebar.tsx`, `theme-toggle.tsx`. Shared: `components/page-header.tsx`, `empty-state.tsx`, `avatar-initials.tsx`, `brand-mark.tsx`, `motion.tsx`, `page-skeleton.tsx`, `auth/{centered-card,password-input,submit-button}.tsx`. Tokens (incl. `success`, `warning`, sidebar) in `app/globals.css`. Branded `app/not-found.tsx` and `app/error.tsx` (pt-BR).

## Behaviours worth knowing
- Agenda hides cancelled appointments; `?canceladas=1` ("Mostrar canceladas") shows them and survives day/dentist navigation.
- A user without permission is redirected to `/agenda?aviso=sem-permissao` and sees an explanatory alert (does not persist across navigation).
- Lists: patients/team/pending are avatar lists; dentists/procedures are card grids; weekday picker uses toggle chips (still real checkboxes).
- E2E selectors changed from table `cell` roles to text; the clinic name appears once (sidebar).

## How it was validated
A temporary Playwright "audit" spec (deleted afterwards) walked ~42 screens and states (empty, filled, dialogs, errors, mobile, secretary, invitation states, dark mode), saved screenshots and collected console errors; fixes followed. Reusable recipe: write a throwaway `e2e/zz-*.spec.ts` against the e2e server, screenshot to the scratchpad, delete it.
