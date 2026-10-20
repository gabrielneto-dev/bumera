---
id: CTX-DEC-20261017-auth-email-password-invites
type: decision
title: Login por e-mail e senha com biblioteca consolidada; administrador convida a equipe
branch: architecture
tags: [auth, security, roles]
status: active
confidence: high
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-DEC-20261017-roles, CTX-DEC-20261016-stack-nextjs-n8n]
---

# Decision
E-mail + password authentication using a vetted, maintained library (no hand-rolled auth). The clinic administrator invites the secretary and the dentist by e-mail. Roles per `CTX-DEC-20261017-roles`.

## Open
Specific library, password policy, session handling, password reset, optional 2FA later.
