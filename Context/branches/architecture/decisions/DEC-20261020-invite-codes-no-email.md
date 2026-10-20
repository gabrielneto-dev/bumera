---
id: CTX-DEC-20261020-invite-codes-no-email
type: decision
title: Sem provedor de e-mail por enquanto: acesso da equipe por código exibido na tela
branch: architecture
tags: [auth, security, roles]
status: superseded
confidence: medium
created_at: 2026-10-20
updated_at: 2026-10-20
related: [CTX-DEC-20261017-auth-email-password-invites, CTX-QUE-20261018-email-provider]
superseded_by: CTX-DEC-20261020-email-on-screen
---

# Decision
The e-mail provider choice is postponed. For now, team onboarding uses **invitation codes shown on screen**: the clinic admin generates a code for a role (secretary or dentist), sees it once, and shares it by hand (e.g. WhatsApp); the invitee enters the code on the sign-up screen to join that clinic.

## Interpretation (to confirm)
The user said the code should "arrive on the login screen itself". The agent understood: the invitee types the code at sign-up/login; the admin sees the generated code in the app. Password recovery for members: admin-issued reset code, same mechanism (proposal, not yet agreed).

## Design constraints
Code is random with enough entropy (about 50 bits, unambiguous alphabet), stored only as an HMAC hash, single use, expires (draft: 48 h), tied to clinic and role, attempts rate-limited. Better Auth's e-mail invitations stay unused (`sendInvitationEmail` keeps failing loudly in production).

Superseded 2026-10-20: the agent misread the request. The user meant the e-mail confirmation code showing on screen, not invitation codes. See `CTX-DEC-20261020-email-on-screen`.
