# Análise de lacunas — IA no WhatsApp (código atual × plano)

Data: 2026-10-25. Base: `main` em f1029ac (módulo 4 já em produção). Plano de referência: `docs/ai-whatsapp-architecture.md`.

## 1. Como o sistema funciona hoje

```
Paciente ─► Evolution ─► POST /api/webhooks/evolution/<token>            (app)
                          │  parseEvolutionMessage: só texto, ignora fromMe, grupo, mídia
                          │  clínica = clinic_settings.whatsappInstance
                          ├─ INBOUND_BUFFER_MS=0 → handleInboundMessage na hora
                          └─ senão grava inbound_buffer + setTimeout(8 s) → flushBuffered
                                                         ▲
n8n (a cada 1 min) ─► GET /api/v1/reminders/due ─────────┘ também faz flush (rede de segurança)
                          │  claimDueReminders: lembretes + respostas (REPLY_*) devidos
                          ▼
                     n8n envia cada um pela Evolution ─► POST /result (sent/failed)

handleInboundMessage (lib/inbound/handle.ts):
  "recomeçar" → reinicia diálogo │ contato novo → diálogo de agendamento
  SAIR → opt-out │ diálogo aberto → continueConversation (lib/booking/conversation.ts)
  1/2 → confirma/remarca (ou responde campanha) │ texto livre → agendar/saudação → diálogo
                                                 └ senão receiveFreeText (IA interpret → age, responde ou passa à secretária)
Resposta = linha na tabela reminder (REPLY_*), que só sai quando o n8n consultar /due.
```

## 2. O que já está bom e deve ficar

| Ponto forte | Onde | Observação |
|---|---|---|
| Determinístico antes da IA (1/2/SAIR, urgência, "recomeçar") | `lib/inbound/intent.ts`, `urgent.ts`, `booking/text.ts` | É o princípio A2.1 do plano. |
| O app decide, a IA só lê e escreve | `booking/fluid.ts` `validatePhrase`, `findNextSlots` | Horários vêm do banco, texto da IA é validado, há texto fixo de reserva. É o princípio A2.2. |
| Proteções de entrada | `ai/mask.ts`, `inbound/injection.ts`, limiares de confiança | Mascara dados pessoais, barra injeção, CPF nunca vai à IA. |
| Tetos de custo e abuso | `conversation.ts` (40 por conversa, 400/dia), `free-text.ts` (100/dia), 30 contatos novos/dia | Contados em chamadas, não em dinheiro. |
| Idempotência | `messageId` em buffer, `lastMessageId`, `@@unique` nas respostas | Reentrega do webhook não duplica. |
| Escopo por clínica | instância → clínica, `scopedPrisma` | Uma mensagem nunca age em outra clínica. |
| Avaliação e qualidade | `scripts/ai-eval.ts`, `ai-dialog-eval.ts`, `/qualidade-ia`, `ai_event` | Avaliação real com Haiku 5.5 (29/29 e 42/42). |
| Um único remetente | tabela `reminder` (lembretes e respostas no mesmo fluxo) | Já cumpre a ideia do `CTX-DEC-20261025-single-sender-outbox`; falta só tirar o envio do n8n. |
| LGPD | textos apagados depois de tratados, auditoria, anonimização | Mantém. |

## 3. Lacunas

Gravidade: **A** afeta o paciente ou a operação hoje; **M** limita o que dá para construir; **B** risco baixo ou já mitigado.

| # | Lacuna | Evidência | Grav. | Componente do plano |
|---|---|---|---|---|
| L1 | **Resposta presa ao relógio do n8n.** Toda resposta, inclusive do diálogo, só sai quando o n8n consulta `/due` (1 min). Latência típica de 8 s + até 60 s + envio em lote sequencial. | `queueFlowReply` só grava `reminder`; workflow `reminders-whatsapp.json` com intervalo de 1 min | A | B5, B10 (worker + outbox) |
| L2 | **Buffer frágil.** Um `setTimeout` por mensagem dentro da rota do Next; reinício perde o timer (o `/due` cobre em até 1 min); janela fixa de 8 s sem teto, então quem não para de escrever nunca é respondido; cada flush varre o buffer de todas as clínicas. | `app/api/webhooks/evolution/[token]/route.ts`, `lib/inbound/buffer.ts` | A | B5 (debounce por fila com teto) |
| L3 | **Sem serialização por número.** Dois lotes do mesmo número podem ser tratados ao mesmo tempo (o primeiro ainda esperando a IA, ~2 s por chamada), com atualização concorrente da `conversation` sem trava. | `flushBuffered` reivindica o lote, mas não impede outro lote do mesmo número em paralelo | M | B5 (uma conversa, um turno) |
| L4 | **Secretária invisível para o robô.** Mensagens enviadas pelo celular da clínica (`fromMe`) são descartadas; o sistema não sabe que um humano assumiu. Enquanto a secretária conversa, cada texto livre do paciente recebe "a equipe responde em breve". | `lib/inbound/evolution.ts:41`, `REPLY_HANDOFF` por mensagem | A | B3/B4 (`staff.message` → controle `human`) |
| L5 | **Áudio e mídia são ignorados em silêncio.** O paciente não recebe resposta e a clínica não fica sabendo (áudio é muito comum no Brasil). | `textOf` só lê texto; a rota responde `IGNORED` | A | B5 (mídia) + Fase 4 do plano (transcrição) |
| L6 | **Sem histórico nem memória.** Não há registro das mensagens; a IA vê só a mensagem atual e a etapa. Os textos de entrada são apagados e os de saída ficam soltos em `reminder.text`. | NTE booking-dialog "a IA não vê o histórico"; não há tabela de mensagens | M | B11 (memória) |
| L7 | **Dois "cérebros" e roteamento em cascata.** `receiveFreeText` (interpret) e o diálogo (understandTurn/phrase) têm prompts, tetos e regras separados; `handle.ts` decide por uma escada de `if`. Cada capacidade nova (remarcar pelo chat, cancelar, dúvida no meio do diálogo) é mais um ramo. | `lib/inbound/handle.ts`, `free-text.ts`, `booking/conversation.ts` (534 linhas) | M | B6 (turno em estágios) |
| L8 | **Não é cíclico.** Tudo reage à mensagem recebida. O diálogo expira em silêncio em 24 h; o handoff é terminal (a conversa não volta ao robô); mudanças na agenda não reabrem a conversa. Os únicos gatilhos proativos são os lembretes por horário. | `expireStaleConversations`, `handOff` → `HANDED_OFF` | M | B2/B3 (eventos e ciclos) |
| L9 | **Observabilidade e custo.** `ai_event` guarda só contagens; não há rastro por turno (entrada, decisão, validação, latência, tokens, custo em reais). O teto de 30% da mensalidade não é aplicável sem o custo em dinheiro. | `lib/ai/events.ts` | M | B12, A4 |
| L10 | **Sem aviso de assistente virtual** nos textos fixos (decisão já aprovada). | `booking/messages.ts`; só o prompt interno diz "atendente virtual" | M | `CTX-DEC-20261025-assistant-disclosure` |
| L11 | **Envio sem ritmo humano e sem status de entrega.** O n8n envia em lote, sem intervalo nem atraso por número; só sabe sucesso/falha HTTP, sem entregue/lido; conexão do número não é monitorada. | workflow n8n; webhook assina só `MESSAGES_UPSERT` | M | B10 (pacing, status, conexão) |
| L12 | **Autonomia é liga/desliga.** A IA ou age sozinha (acima do limiar) ou não existe; não há modo sombra nem copiloto. | `clinic_settings.aiEnabled` | B | A3 (escada de autonomia) |
| L13 | **Segredo do webhook na URL.** Aparece em logs de proxy. Mitigado: o tráfego é interno (`http://bumera-app:3000`). | `checkWebhookToken(token)` | B | B5 (cabeçalho) |

## 4. O que muda no plano

| Plano original | Ajuste |
|---|---|
| Criar `WhatsappInstance`, `Conversation`, `OutboundMessage` novos | **Reaproveitar**: `clinic_settings.whatsappInstance`; a tabela `reminder` já é o outbox; a `conversation` atual é o estado do diálogo de agendamento. Tabelas novas só onde falta algo: registro de mensagens e controle humano. |
| Fase 1 "canal determinístico" do zero | **Já existe** (M4). A nova Fase 1 é trocar o transporte: worker no lugar do `setTimeout` e do n8n. |
| Turno em 7 estágios escrito do zero | **Refatorar** `handle.ts` + `free-text.ts` + `conversation.ts` para o pipeline, mantendo comportamento e testes (789). |
| Novo parser do Evolution | **Estender** `lib/inbound/evolution.ts` (fromMe, mídia, status, conexão). |
| Escolha de modelo | **Já feita**: Haiku 5.5 via OpenRouter, com avaliação. |

## 5. Roteiro refeito (substituição gradual, cada fase entra em produção sozinha)

### Fase 1 — Processamento e transporte (resolve L1, L2, L3, L11 em parte, L5 em parte)
1. Worker como serviço no `~/bumera-app` (uma réplica; healthcheck; mesmo build do app).
2. Webhook passa a só gravar no `inbound_buffer` e chamar `enqueueDebounced` (chave e grupo = clínica + número; janela de 6 s, mais 2 s por mensagem, teto de 20 s, espera máxima de 45 s). Sai o `setTimeout`; sai o flush do `/due`. O tratamento continua sendo `handleInboundMessage`.
3. Remetente no worker: cliente Evolution (`sendText`) e envio por instância, um de cada vez, com intervalo, jitter e atraso humano proporcional ao texto. Resposta (`REPLY_*`) é enviada na hora pela fila; lembretes por agendamento a cada minuto. Reaproveita `claimDueReminders`/`recordReminderResult`. Grava o id da mensagem do WhatsApp no `reminder`.
4. Chave de troca `WHATSAPP_SENDER=worker|n8n`: nunca os dois ao mesmo tempo (envio duplo). Depois de validado com o número de teste, o workflow do n8n é desativado.
5. Mídia sem texto: resposta fixa ("ainda não consigo ouvir áudios, pode escrever?") + item em Pendentes.
- **Critérios:** p95 da mensagem recebida até a resposta enviada < 20 s (hoje até ~70 s); `kill -9` do worker no meio não perde nem duplica resposta; nunca dois turnos do mesmo número ao mesmo tempo.

### Fase 2 — Estado e memória da conversa (L4, L6, L10, L11)
Registro de mensagens (entrada e saída, retenção limitada); mensagem da clínica pelo celular (`fromMe` sem id no ledger) põe o número em atendimento humano: robô em silêncio até a secretária liberar ou o prazo vencer; aviso de assistente virtual na primeira mensagem automática; status entregue/lido e estado da conexão.

### Fase 3 — Turno unificado (L7, L9)
Um pipeline (perceber → entender → rotear → deliberar → verificar → efetivar → refletir) no lugar da escada de `if`; um só cliente de IA com orçamento em reais; rastro por turno (substitui e alimenta o `/qualidade-ia`); a IA passa a ver as últimas mensagens (mascaradas). Comportamento atual preservado pela suíte existente.

### Fase 4 — Ciclo (L8)
Remarcar pelo chat (já era o próximo passo do projeto); retomada de diálogo parado (uma vez); a conversa volta ao robô quando a secretária resolve; aviso ao paciente quando a clínica muda a consulta; recuperação de falta.

### Fase 5 — Autonomia e aprendizado (L12)
Modos sombra e copiloto em Pendentes; disjuntor que rebaixa a autonomia em incidente; propostas de ajuste a partir das edições da secretária.

### Fase 6 — Conhecimento e crescimento
Base de conhecimento da clínica, lista de espera, reativação inteligente.

## 6. Decisões necessárias

1. **Outbox:** reaproveitar a tabela `reminder` como fila de saída (recomendado), em vez de criar `outbound_message`.
2. **Retenção do registro de mensagens** (Fase 2): proposta de 90 dias para o texto; depois só metadados.
3. **Atendimento humano** (Fase 2): robô em silêncio até a secretária liberar ou 12 h sem mensagem dela.
4. **Corte do n8n** (Fase 1): troca por chave, sem período com os dois enviando; o n8n fica sem papel na conversa.
