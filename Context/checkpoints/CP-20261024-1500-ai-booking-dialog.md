---
id: CTX-CP-20261024-1500-ai-booking-dialog
type: checkpoint
title: Módulo 4 no ar: IA por clínica, diálogo de agendamento com dependentes e conversa fluida
branch: global
tags: [ai-assistant, whatsapp, scheduling, roadmap]
status: active
created_at: 2026-10-24
updated_at: 2026-10-24
---

# Session Checkpoint

## What changed
- Caixa de mensagens + assistente de IA opt-in com chave criptografada, avaliação de modelos (Haiku 5.5): `CTX-NTE-20261024-ai-assistant-and-inbox`.
- Diálogo de agendamento para contato novo e paciente, consulta para outra pessoa (dependentes), camada fluida com IA que lê e escreve: `CTX-NTE-20261024-booking-dialog`, regras do usuário: `CTX-DEC-20261024-ai-booking-rules`.
- Deploy em produção do commit 20ce1f3 (backup antes, as duas imagens reconstruídas, migrations aplicadas). 715 testes, ~96,8% de cobertura.
- Login de teste do app redefinido a pedido do usuário e anotado no cofre do Obsidian (fora do repositório).

## Problems and causes
- Haiku 5.5 truncava o JSON porque raciocinava; solução: `reasoning:{enabled:false}`.
- Regex de pedido de humano pegava "outra pessoa".
- Escritas em produção (trocar senha) exigem regra de Bash do usuário; o classificador bloqueia sem ela e não se contorna.

## Failed approaches worth remembering
Modelos baratos (gpt-4o-mini obedeceu injeção; qwen3.7-flash vazio; mistral-small 429): não repetir sem reavaliar com `scripts/ai-eval.ts`.

## Open
Teste real no WhatsApp do diálogo fluido; melhorias da IA (preferência de dia/período, remarcar pelo chat, painel de qualidade, memória curta, áudio); itens de fim de projeto (e-mail real, recuperação de senha, backup fora do servidor, Cloudflare Access na Evolution, cópia das chaves de CPF fora do servidor, retenção/apagamento na Evolution, limpeza de dados de teste e do cache do Docker).

## Next steps
Usuário testa o fluxo; depois painel de qualidade e preferência de dia/período.
