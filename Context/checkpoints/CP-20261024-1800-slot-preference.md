---
id: CTX-CP-20261024-1800-slot-preference
type: checkpoint
title: Preferência de dia/período no diálogo de agendamento, avaliada e no ar
branch: global
tags: [ai-assistant, whatsapp, scheduling, roadmap]
status: active
created_at: 2026-10-24
updated_at: 2026-10-24
related: [CTX-NTE-20261024-booking-dialog, CTX-CP-20261024-1500-ai-booking-dialog]
---

# Session Checkpoint

## What changed
- O diálogo entende "só à tarde", "quinta ou sexta de manhã", "depois das 17h" e filtra os horários livres reais; "ver outros" respeita a preferência; sem horário como pedido, avisa e mostra os mais próximos. Detalhes e mapa do código: `CTX-NTE-20261024-booking-dialog` (seção Preferência).
- Avaliação real com Haiku 5.5: leitura 29/29, escrita 36/36 (um caso exigiu ajuste de prompt).
- Deploy do df864dd (app e migrate reconstruídos; sem migrations). 723 testes, ~96,9%.

## Problems and causes
- "pode ser a terça de manhã" era lido como preferência em vez de escolha do horário 1: corrigido no prompt. O teste do cliente falha se o prompt de sistema contiver texto da mensagem de exemplo; usar exemplos diferentes.
- `--from-db` não funciona no banco de dev (sem a tabela `clinic_settings`); a chave salva só existe em produção. Fora dali, usar `OPENROUTER_API_KEY` exportada pelo usuário.

## Open
Teste real da preferência no WhatsApp; painel de qualidade da IA; remarcar pelo chat; itens de fim de projeto (ver `STATE.md`).

## Next steps
Usuário testa; depois painel de qualidade.
