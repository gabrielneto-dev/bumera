---
id: CTX-DEC-20261020-email-on-screen
type: decision
title: E-mail entregue na tela por enquanto, atrás de uma camada de envio trocável
branch: architecture
tags: [auth, security, integration]
status: active
confidence: high
created_at: 2026-10-20
updated_at: 2026-10-20
related: [CTX-QUE-20261018-email-provider, CTX-DEC-20261017-auth-email-password-invites]
---

# Decision
The e-mail provider is postponed. Everything the system would e-mail is **delivered on screen for now**, behind an `EmailTransport` abstraction (current implementation: on-screen; later: a real provider with no change to the flows). User's words: the e-mail confirmation code will, for now, appear on the login screen.

## Scope
- **E-mail verification code:** after sign-up the user sees a verification step with the code displayed on screen (own account only, via a server action that captures the message in the same request).
- **Team invitations:** Better Auth's native invitations (admin chooses e-mail and role); the invitation link is shown to the admin to copy and send by hand. The invitee opens it, creates the account or signs in with that e-mail and accepts.
- **Password reset:** NOT delivered on screen: whoever requests the reset could read the code and take over any account. Deferred until a real provider exists; interim reset is operator-assisted.

## Known limitation
On-screen verification proves nothing about e-mail ownership; it is a placeholder that lets the flow exist. Real verification returns with the provider (`CTX-QUE-20261018-email-provider`).
