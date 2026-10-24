---
id: CTX-NTE-20261024-booking-dialog
type: note
title: Diálogo de agendamento por WhatsApp: máquina de estados, dependentes e camada fluida com IA
branch: architecture
tags: [ai-assistant, whatsapp, scheduling, patient, architecture]
status: active
confidence: high
created_at: 2026-10-24
updated_at: 2026-10-24
related: [CTX-NTE-20261024-ai-assistant-and-inbox, CTX-DEC-20261024-ai-booking-rules, CTX-NTE-20261021-m4-inbound-replies, CTX-NTE-20261022-lgpd-audit-export-erasure]
---

# Diálogo de agendamento (commits 9fa78a6, c098652, 20ce1f3; migrations 20261023120000_m7_booking_conversation, 20261023150000_m7_dependents, 20261024100000_m7_fluid_dialog)

## Mapa do código
- `lib/booking/conversation.ts`: `startConversation`, `continueConversation`; tabela `conversation` (uma OPEN por telefone, TTL 24 h, 3 erros seguidos = secretária, 30 contatos novos/dia/clínica). Etapas: PROCEDURE → WHO (para mim / outra pessoa) → PERSON (nome do paciente) → NAME (nome de quem escreve; contato dos avisos se for outra pessoa) → SLOT (3 horários reais por vez, "ver outros") → CONFIRM → pedido PENDENTE (`bookAppointment(..., {pending:true})`, a secretária aprova em Pendentes). `missingStep` calcula a próxima etapa pelo que falta; `Turn` carrega clínica, IA, contagem de chamadas e a resposta lateral.
- `lib/booking/{text,messages,slots,fluid}.ts`: `parseChoice`, `matchProcedure`, `detectWhom`, `cleanName`; textos fixos (reserva); `findNextSlots` (só horários livres reais, mínimo 2 h de antecedência); validação do texto escrito pela IA.
- Contato novo: o número é acolhido e guiado (cadastro PENDING, `source WHATSAPP`, consentimento registrado ao confirmar). Paciente conhecido: segue direto.

## Dependentes (consulta para filho/familiar)
`patient.guardianName`: o dependente é um cadastro próprio com o telefone do responsável; todos os avisos vão ao responsável e falam do paciente ("a consulta de *Pedro*"). Um mesmo dependente (mesmo nome + telefone) é reaproveitado. Resposta "1/2" com vários pacientes no telefone vale para a consulta da última mensagem enviada em 48 h (`findSubjectAppointment`) e depois caminha pelas que aguardam. Apagar o adulto (LGPD) também apaga telefone/responsável dos dependentes.

## Camada fluida (IA lê e escreve; o app decide)
- Com IA: o paciente escreve livremente ("pode ser a terça de manhã", "é pro meu filho", "fechado"). `understandTurn` extrai procedimento/para quem/horário/confirmação/pedido de humano/resposta a pergunta lateral (confiança mínima 0,8); `phrase` escreve a próxima pergunta em tom natural. Número isolado ("1") e nome simples continuam tratados sem IA.
- O app mantém o controle: horários, etapas e cadastro vêm do banco. `validatePhrase` só deixa sair texto que traga os horários exatos, não invente números (qualquer número precisa estar no material dado), sem links, sem prometer confirmação (aviso final precisa dizer "equipe" e nunca "confirmada"), confirmação precisa citar "lembretes" (base do consentimento). Falhou? Usa o texto fixo numerado (reserva). Nomes de pessoas nunca vão à IA: o paciente entra por `{{PACIENTE}}` substituído pelo app.
- Tetos: 40 chamadas por conversa, 400/dia/clínica (`conversation.aiCalls`); mensagem urgente ou pedido de humano encerram com a secretária (motivo URGENT).
- Avaliação real (Haiku 5.5): `scripts/ai-dialog-eval.ts` → leitura 21/22, escrita aceita pela validação 36/36, ~1 s por chamada.

## Armadilhas já corrigidas
- A regex de "falar com humano" tratava "outra pessoa" como pedido de atendente.
- Enum do Postgres criado e usado na mesma migration (CHECK com `REPLY_AI`): CHECK simplificado, regra no código.
- Com `reasoning` ligado o Haiku cortava o JSON por falta de tokens: desligado nas chamadas.

## Preferência de dia/período (commits 856d606, 938bb8f, df864dd)
- `understandTurn` devolve também `prefer` (`SlotPreference`: `weekdays` 0-6 com 0=domingo, `period` morning|afternoon, `fromHour` 0-23). A IA só diz o que a pessoa pediu; quem escolhe horários é `findNextSlots(..., preference)` com `matchesPreference` (`lib/booking/slots.ts`), sempre sobre horários livres reais.
- Em `conversation.ts`: no passo SLOT, sem horário escolhido e com `prefer`, oferece de novo (offset 0) filtrado; no CONFIRM, "não, prefiro de manhã" volta aos horários filtrados. A preferência fica em `slotOptions.prefer` (JSON, sem migration) para "ver outros" continuar dentro dela. Sem horário livre como pedido: texto `noMatch` e os mais próximos sem filtro (facts avisam a IA).
- Regra do prompt: se a mensagem aponta UM horário oferecido ("terça de manhã" com um só horário assim), vale `slot`, `prefer` fica nulo. Sem isso o Haiku tratava como preferência.
- Avaliação real (Haiku 5.5, `scripts/ai-dialog-eval.ts`, 29 casos de leitura): 29/29 e escrita 36/36. Rodar: `export OPENROUTER_API_KEY` (a chave é do usuário, nunca guardar no repositório) e `npx tsx scripts/ai-dialog-eval.ts --models anthropic/claude-haiku-5.5`; ou no servidor com `--from-db` (chave salva da clínica).
- Deploy em produção do df864dd em 2026-10-24 (sem migration). 723 testes, ~96,9% de cobertura.
