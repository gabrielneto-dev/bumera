---
id: CTX-DEC-20261025-assistant-disclosure
type: decision
title: Aviso de assistente virtual na primeira mensagem da conversa
branch: ai-agent
tags: [ai-assistant, lgpd, whatsapp]
status: active
confidence: medium
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-RSK-20261014-lgpd-patient-data]
supersedes: null
superseded_by: null
---

# Decision
The first automated message in a conversation is prefixed with a disclosure (applied by a send gate, editable per clinic). Default text:

> Olá, {primeiro nome}! Aqui é a assistente virtual da {clínica}. Posso confirmar, remarcar ou tirar dúvidas sobre a sua consulta. Se preferir falar com a equipe, é só escrever "atendente".

## Consequences
"atendente" must be recognised as a handoff request by the rule layer. The default text was drafted by the agent after the user approved the decision; the user may change it. Approved on 2026-10-25.
