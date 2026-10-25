---
id: CTX-CP-20261025-0100-open-question-buffer
type: checkpoint
title: Pergunta aberta para saudações, buffer de mensagens e n8n a cada minuto, no ar
branch: global
tags: [ai-assistant, whatsapp, scheduling, roadmap]
status: active
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-NTE-20261024-booking-dialog, CTX-CP-20261024-1800-slot-preference]
---

# Session Checkpoint

## What changed
- Saudação pura recebe "Em que posso te ajudar?" em vez do primeiro passo do formulário; buffer de 8 s junta mensagens seguidas em uma resposta; n8n consulta a fila a cada 1 min. Detalhes: `CTX-NTE-20261024-booking-dialog` (seção Abertura aberta e buffer).
- Deploy de 8c8e347 (migration `inbound_buffer`), workflow do n8n reimportado e `infra-n8n` reiniciado com autorização do usuário.

## Problems and causes
- A IA estava desligada na clínica (`aiEnabled=false`): texto livre ia só para a secretária com o aviso fixo. Para ligar, a tela Assistente exige o texto de informações da clínica (obrigatório); a chave já estava salva.
- A demora de ~3 min vinha do ciclo do n8n, não da IA; o "Desculpe, não entendi" veio de um "Oi" caindo em pergunta do diálogo aberto por outro "Oi" lido como pedido de agendamento.
- O export do n8n omite `minutesInterval` quando é o padrão (5); editar o JSON por `sed` não acha o campo, usar edição estruturada.
- Chave OpenRouter colada no chat pelo usuário para a avaliação: nunca gravada no repositório (regra do AGENTS.md); o usuário vai revogá-la.

## Open
Teste real no WhatsApp (saudação, mensagens em sequência, preferência de dia/período); painel de qualidade da IA; remarcar pelo chat; reduzir mais a latência exigiria enviar direto pelo app sem o n8n; itens de fim de projeto (ver `STATE.md`).

## Next steps
Usuário testa; depois painel de qualidade.
