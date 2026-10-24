---
id: CTX-DEC-20261024-ai-booking-rules
type: decision
title: Regras da IA no WhatsApp: opt-in, pedido pendente, acolher contato novo, consulta para outra pessoa e diálogo fluido
branch: product
tags: [ai-assistant, whatsapp, scheduling, patient, privacy, product-modules]
status: active
confidence: high
created_at: 2026-10-24
updated_at: 2026-10-24
related: [CTX-NTE-20261024-ai-assistant-and-inbox, CTX-NTE-20261024-booking-dialog, CTX-DEC-20261014-module-sequencing]
---

# Decisão (do usuário, 2026-10-22 a 24)

- Primeira fatia do módulo 4: entender respostas livres e responder perguntas básicas. **A IA só responde sozinha o que é seguro** (informações cadastradas pela clínica); o resto vai para a secretária.
- **Opt-in por clínica**, com mascaramento de dados pessoais. A chave do OpenRouter é digitada **dentro do sistema** (tela Assistente), criptografada e só de escrita; o modelo é escolha técnica nossa (Haiku 5.5).
- **Pedido de consulta pelo WhatsApp** (cliente novo ou paciente): vira **pedido pendente que a secretária aprova**; a IA não confirma horário.
- **Número desconhecido** é acolhido e guiado até o pedido (não ignorado nem só encaminhado).
- **Consulta para outra pessoa** (filho/familiar): o sistema pergunta para quem é, cadastra o dependente e envia os avisos ao responsável.
- **Conversa fluida, sem escolher números**: a IA lê e escreve, o sistema decide horários, etapas e valida o texto; menu numerado fica só como reserva.

**Why:** a clínica não pode ter horário errado nem promessa feita por IA; o paciente quer conversar, não digitar opções.
**How to apply:** nunca deixar a IA inventar horário/preço/orientação clínica nem confirmar sozinha; qualquer texto gerado passa por validação do app; nomes não vão à IA. Ideias fora do escopo (preço, orientação clínica, agendamento sem aprovação) ficam de fora de propósito.
