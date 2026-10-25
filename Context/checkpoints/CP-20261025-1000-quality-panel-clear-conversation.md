---
id: CTX-CP-20261025-1000-quality-panel-clear-conversation
type: checkpoint
title: Painel de qualidade da IA, limpar conversa, lista de conversas em andamento e correções do diálogo
branch: global
tags: [ai-assistant, whatsapp, scheduling, roadmap]
status: active
created_at: 2026-10-25
updated_at: 2026-10-25
related: [CTX-NTE-20261024-booking-dialog, CTX-CP-20261025-0100-open-question-buffer]
---

# Session Checkpoint

## What changed
- Tela Qualidade da IA com contadores novos (`ai_event`); botão e comando "recomeçar" para limpar conversa; seção "Conversas em andamento" em Pendentes; correções de fala do diálogo (procedimento não encontrado, saudação repetida, "pode ser" escolhe o único procedimento). Tudo em produção, último deploy 382d9b2. Detalhes e mapa do código: `CTX-NTE-20261024-booking-dialog` (seção Painel de qualidade, limpar conversa e ajustes).

## Problems and causes
- Nos testes reais no WhatsApp: "clareamento" (não cadastrado) respondia "não entendi", e "pode ser" ao único procedimento oferecido não era entendido, levando 3 erros seguidos à secretária. Corrigidos; lição: falas que propõem uma opção precisam aceitar um "sim" simples.
- Conversa antiga ainda aberta (TTL 24 h) faz uma saudação repetir a pergunta do passo antigo; por isso existe o limpar conversa.

## Open
Usuário reteste no WhatsApp o fluxo completo (recomeçar → clareamento → pode ser → nome → horário com preferência → confirmar → Pendentes); remarcar pelo chat; reduzir a latência do n8n (1 min) exigiria envio direto pelo app; itens de fim de projeto (ver `STATE.md`). Chave OpenRouter colada no chat pelo usuário deve ser revogada por ele (nunca gravada).

## Next steps
Usuário testa; depois remarcar pelo chat e itens de fim de projeto.
