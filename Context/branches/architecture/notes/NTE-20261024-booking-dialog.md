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

## Abertura aberta e buffer de mensagens (commits 2ba11b4, 8c8e347; migration 20261025000000_m7_inbound_buffer)
- Saudação pura (`isGreeting` em `lib/booking/text.ts`: "oi", "olá, boa noite", "tudo bem?") não abre o formulário: `startConversation` cria a conversa sem procedimento e responde a pergunta aberta (`say.openQuestion`, meta `ask_open` quando a IA escreve; texto fixo manda escrever *agendar* se não há IA). Vale para paciente conhecido (`handle.ts`) e contato novo. Dentro do diálogo, nova saudação repete a pergunta sem contar erro. "Quero marcar" sem procedimento: usa o único procedimento da clínica ou mostra a lista, sem penalidade. Testes antigos que usavam "oi" como texto genérico passaram a usar "vai demorar?".
- Buffer: `lib/inbound/buffer.ts` + tabela `inbound_buffer` (tenant). Com `INBOUND_BUFFER_MS` > 0 (produção: 8000, em `deploy/compose.app.yml`; padrão 0 = responde na hora, como nos testes) o webhook só guarda a mensagem e agenda `flushBuffered` (+250 ms); o flush junta os textos do número (separador `\n`, `messageId` da última) e chama `handleInboundMessage` uma vez. Reivindicação por `deleteMany` em transação (só um flush vence); se o tratamento falha, devolve as linhas por até 10 min. `GET /api/v1/reminders/due` também faz o flush antes de entregar respostas, então reinício do app não perde mensagens.
- Latência: respostas só saem quando o n8n consulta `/due`. O workflow "Bumera - Lembretes por WhatsApp" (id `7msgAcP3Ptnh5r9r`) foi mudado de 5 min para 1 min (repo `n8n/workflows/reminders-whatsapp.json` atualizado). Reimportar por CLI: `docker exec infra-n8n n8n export:workflow --id=... ` -> editar -> `import:workflow` (mantém as credenciais ligadas) -> `update:workflow --active=true` -> `docker restart infra-n8n` (a importação desativa o workflow; o n8n exportado omite `minutesInterval` quando é o padrão, que é 5).
- Avaliação real (Haiku 5.5): leitura 29/29, escrita 42/42. 749 testes, ~96,7%.

## Painel de qualidade, limpar conversa e ajustes do diálogo (commits 9ba0cff, 54b5ba8, 9322bfd, 8c5193a, 382d9b2; migrations 20261025120000_m7_ai_events, 20261025140000_m7_conversation_cleared)
- Painel `/qualidade-ia` (admin, `triggerRule` read; período 7/30/90 dias): `lib/services/ai-quality.ts` junta o que já existia (conversation: status, etapa em que passou à secretária, aiCalls; inbound_message: reason/aiIntent) com a tabela nova `ai_event` (só `kind` + clínica, sem texto): `TURN_READ/UNSURE/FAILED`, `PHRASE_USED/REJECTED/FAILED`, `ASIDE_ANSWERED/REJECTED`, gravados por `recordAiEvent` (best effort, nunca derruba a conversa) em `understand()` e `speak()`. Avisos em português só com ≥10 amostras (`guidance`). Contadores começam do deploy.
- Limpar conversa (`lib/services/conversations.ts`, `clearConversation`): encerra o diálogo OPEN do número (EXPIRED, apaga nome/horários), cancela REPLY_FLOW PENDING, marca como tratadas as mensagens abertas do número (texto apagado), audita `CONVERSATION_CLEARED`. Alvos: `patientId`, `inboundMessageId`, `conversationId`. UI: botão em Pacientes e em Pendentes (mensagens e nova seção "Conversas em andamento", `listOpenConversations`, sem nomes digitados no diálogo). WhatsApp: a pessoa escreve só "recomeçar/reiniciar/limpar conversa/começar de novo" (`isResetCommand`), o app fecha o diálogo e responde a pergunta aberta; a mesma entrega repetida é ignorada.
- Ajustes aprendidos com o uso real: procedimento não encontrado diz "não encontrei esse procedimento" (texto fixo `procedureNotFound`; prompt manda não dizer "não entendi" nem afirmar que a clínica não faz); saudação repetida recebe resposta curta sem se apresentar de novo; um "sim/pode ser/claro" (`isAffirmation`, ou `confirm: yes` lido pela IA) escolhe o único procedimento da clínica; com vários procedimentos um "sim" solto não escolhe.
- Armadilhas: a mensagem "oi" como texto genérico nos testes passou a abrir a pergunta aberta (usar "vai demorar?"); `tests/reminders/api.test.ts` quebrava depois das 21h por causa do horário de silêncio (agora desliga o silêncio na clínica do teste); o túnel SSH para o banco de teste cai e a suíte falha com P1001 até reabrir (`npm run db:tunnel`).
- 789 testes, ~96,8% de cobertura. Avaliação real do diálogo (Haiku 5.5): leitura 29/29, escrita 42/42.
