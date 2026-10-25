# Arquitetura da IA no WhatsApp — plano estratégico e tático

> **2026-10-25:** este plano foi escrito antes de o módulo 4 entrar no `main`. A Parte A (estratégia) e a arquitetura-alvo da Parte B continuam valendo; o roteiro tático (Parte C) foi substituído pelo roteiro de `docs/ai-gap-analysis.md`, que parte do código em produção.

Status: proposta v2 (2026-10-25). Aprovado pelo usuário: (D1) portar padrões do DeskcommCRM, sem fork; (D2) conversa 100% no app, n8n fora do caminho da conversa; (D3) canal determinístico antes do LLM. Novas propostas desta versão estão marcadas como **[decidir]**.

Premissa: não há código de IA, webhook de entrada ou buffer no repositório hoje; o plano parte do zero (o app tem lembretes M2, serviços com permissão e `scopedPrisma`).

---

# Parte A — Estratégia

## A1. Objetivo

> Uma secretária virtual que **nunca erra a agenda**, responde como gente e sabe quando passar a vez.

Valor para a clínica, em ordem: (1) menos faltas, (2) menos tempo da secretária no WhatsApp, (3) horários cancelados preenchidos, (4) pacientes antigos reativados. A IA é meio, não produto: cada capacidade só entra se mover um desses números.

## A2. Princípios (regras de projeto, não aspirações)

1. **Determinístico antes de probabilístico.** O que regra resolve ("1", "SAIR", "confirmo") não passa pelo LLM. O LLM cobre o resto.
2. **O modelo propõe, o sistema decide.** O LLM nunca escreve no banco nem envia mensagem. Ele emite *comandos* tipados; o domínio valida, a política autoriza, o outbox envia.
3. **Conversa é estado + eventos.** Tudo que acontece vira evento; o estado é uma projeção. Isso dá auditoria, replay e o ciclo.
4. **Humano acima do robô, sempre.** Mensagem da secretária silencia o bot; opt-out é irreversível pelo bot.
5. **Banimento e custo são requisitos de primeira classe**, checados antes de cada envio e de cada chamada de modelo.
6. **Autonomia se conquista com dados.** Cada clínica e cada tipo de ação sobe de nível por métrica e desce sozinho em incidente.
7. **Desenvolvimento guiado por avaliação.** Todo incidente vira cenário de teste antes da correção.

## A3. Escada de autonomia

Configurada por clínica **e** por classe de ação. Começa em L1 para toda clínica nova.

| Nível | Nome | O que a IA faz | Para subir de nível (proposta) |
|---|---|---|---|
| L0 | Desligado | Só o canal determinístico (Fase 1) | clínica ativa a IA |
| L1 | Sombra | Gera a resposta, **não envia**; a secretária vê a sugestão ao lado da conversa | ≥ 100 turnos, ≥ 80% das sugestões julgadas "enviaria assim" |
| L2 | Copiloto | Envia com um clique da secretária (pode editar) | ≥ 200 envios, ≥ 90% aprovados sem edição, 0 incidente grave |
| L3 | Autônomo informativo | Responde sozinho perguntas e confirmações; ações na agenda viram **proposta** | 30 dias em L3, 0 incidente grave, taxa de handoff estável |
| L4 | Autônomo com ação | Executa ações de baixo risco (confirmar, registrar opt-out, remarcar dentro de regra); cancelar segue como proposta | — |

Rebaixamento automático (disjuntor): incidente grave (ação errada na agenda, mensagem a quem saiu, dado de outro paciente) desce um nível na hora e abre alerta em Pendentes.

## A4. Métricas

**Invariantes (alvo = zero, testados em CI):** resposta duplicada; mensagem para quem pediu para sair ou sem consentimento; ação na agenda não autorizada; dado de um paciente em conversa de outro; CPF em prompt ou log.

**Produto (por clínica, mensal):** taxa de falta (antes × depois), taxa de confirmação, % conversas resolvidas sem humano, % horários cancelados reocupados (Fase 5).

**Operação (SLO):** ack do webhook p99 < 300 ms; primeira resposta entre 15 s e 60 s (rápido demais parece robô e aumenta risco de banimento); turno p95 < 30 s; zero job perdido após queda do worker.

**Custo:** gasto de IA por clínica ≤ 30% da mensalidade **[decidir: teto]**. Com o piloto a ~R$50, o teto seria R$15/mês. O custo por turno será medido na Fase 2 com o modelo escolhido; o funil de orçamento existe antes do primeiro cliente.

## A5. Estratégia de modelo

- **Dois níveis:** um modelo barato para classificar sinais e resumir; um modelo principal para o turno. Ambos atrás de um gateway próprio (`lib/llm`), trocáveis por configuração.
- **Escolha por avaliação, não por catálogo:** a suíte de cenários pt-BR (A2.7) roda contra a lista curta já pesquisada (`CTX-RES-20261017-openrouter-model-shortlist`) e decide pela relação acerto × custo.
- **Cache de prompt:** prefixo estável (regras + perfil da clínica + ferramentas) separado do sufixo variável.
- **Fallback:** modelo principal indisponível → modelo reserva; ambos falham → mensagem determinística ("recebemos, a clínica responde em breve") + aviso à secretária.

## A6. Comprar × construir

| Peça | Escolha | Por quê |
|---|---|---|
| Fila/agendador | graphile-worker (reserva: pg-boss) **[confirmar no spike]** | Roda no Postgres que já existe; `jobKey` dá debounce; filas nomeadas serializam |
| Chamada de LLM e ferramentas | Vercel AI SDK | Loop de ferramentas, saída estruturada, vários provedores |
| Canal | Adaptador próprio do Evolution | Fino, isolado atrás de uma interface `Channel` (troca futura para API oficial) |
| Guardrails, estado, memória, outbox | Construir (padrões do DeskcommCRM) | É o núcleo do produto e depende do domínio odontológico |
| Busca semântica (Fase 6) | pgvector no mesmo Postgres | Sem serviço novo |

## A7. Decisão nova: um único remetente **[decidir]**

Anti-banimento exige **um só lugar** contando envios por número. Se a conversa sai pelo app e os lembretes saem pelo n8n, dois remetentes disputam o mesmo número sem ritmo comum. Proposta: os lembretes do M3 também saem pelo outbox do worker; o n8n fica para automações auxiliares. Isso substitui o fluxo M3 planejado (n8n consulta `/api/v1/reminders/due`) por uma tarefa do worker que reaproveita `lib/reminders/dispatch.ts`.

---

# Parte B — Arquitetura

## B1. Topologia

```
 WhatsApp ⇄ Evolution API
              │ webhook                     ▲ envio
              ▼                             │
 ┌─────────── App Next.js ──────────┐       │
 │ /api/v1/whatsapp/webhook (ingresso)│      │
 │ UI: conversas, sugestões, Pendentes│      │
 │ lib/services (domínio + authz)     │      │
 └──────────────┬─────────────────────┘      │
                │ eventos + jobs (mesmo Postgres)
 ┌──────────────▼─────────────────────┐      │
 │ Worker (processo separado, mesmo repo) │  │
 │ turnos · reflexão · agendador · sender ┼──┘
 └────────────────────────────────────┘
          Postgres (bumera_*) — dados, eventos, fila, outbox
```

O worker importa `lib/services` diretamente (mesmo código, mesmas regras de permissão), roda como serviço próprio no compose e é o único processo que chama LLM ou envia mensagem.

## B2. Os três ciclos

O sistema não é entrada → processamento → saída. São três laços aninhados:

1. **Laço do turno (segundos).** Pensar → chamar ferramenta → observar → … → rascunho → gates → veto volta ao modelo → reescreve (máx. 2) → fallback seguro.
2. **Laço da conversa (minutos a semanas).** Evento → turno → comandos e novos eventos → próximo turno. A própria IA agenda gatilhos futuros (follow-up), e eventos externos (secretária mudou a agenda, mensagem falhou, lembrete entregue) reabrem a conversa.
3. **Laço de aprendizado (dias).** Traces → avaliação automática + revisão humana → propostas de ajuste (prompt, playbook, regra) → a clínica publica → nova versão → métricas → autonomia sobe ou desce.

## B3. Modelo de eventos

Tabela `ConversationEvent` (só inserção). O estado da conversa é projeção dela, atualizado na mesma transação.

| Evento | Origem | Efeito |
|---|---|---|
| `patient.message` | webhook | agenda/estende turno (debounce) |
| `patient.reaction`, `patient.presence` | webhook | estende debounce enquanto digita **[verificar suporte no Evolution]** |
| `staff.message` | webhook (`fromMe` que não está no ledger) ou UI | controle → `human`; cancela turno pendente |
| `message.status` | webhook | entregue/lido/falhou; falha → tentativa ou alerta |
| `reminder.sent` / `reminder.failed` | sender | contexto do próximo turno |
| `appointment.changed` | `lib/services/appointments` | turno proativo se afetar paciente com conversa ativa |
| `followup.due` | agendador | turno `followup` com bloco de retomada |
| `proposal.decided` | UI (secretária aprova/recusa) | turno que comunica o resultado ao paciente |
| `handoff.released` | UI | controle → `bot` |
| `patient.opted_out` | regra/comando | controle → `blocked` (irreversível pelo bot) |
| `channel.disconnected` | webhook de conexão | pausa envios do número + alerta |

## B4. Estado da conversa (duas dimensões)

**Controle:** `bot` · `human` · `blocked`. **Fase:** `idle` · `awaiting_patient` · `awaiting_staff` (proposta pendente).

| De | Gatilho | Para |
|---|---|---|
| `bot` | `staff.message` ou comando `handoff` | `human` (silencia até `handoff.released` ou TTL configurável) |
| `human` | `handoff.released` / TTL | `bot` |
| qualquer | `patient.opted_out` | `blocked` |
| `blocked` | consentimento renovado pela clínica na UI | `bot` |
| `idle` | turno enviou pergunta | `awaiting_patient` (agenda follow-up se não houver resposta) |
| `*` | comando virou proposta | `awaiting_staff` |

Em `human`, mensagem do paciente não gera turno: gera notificação. Em `blocked`, nada é enviado (gate `stop`).

## B5. Ingresso e buffer

Webhook: valida segredo (header/token **[verificar formato no Evolution]**), valida o payload com Zod, resolve instância → clínica (nunca pelo payload), deduplica pelo id da mensagem do provedor (índice único), grava `WhatsappMessage` + evento, enfileira e responde. Nenhuma chamada externa no caminho.

Buffer de rajada (debounce adaptativo):

- Job `turn` com `jobKey = turn:{conversationId}`; cada mensagem nova substitui o prazo.
- Prazo = última mensagem + janela; janela base 6 s, +2 s por mensagem da rajada, teto 20 s; se o paciente está digitando (se o canal informar), estende até o teto.
- Áudio/imagem: tarefa de derivação (transcrição/descrição) antes do turno; o turno espera a derivação ou segue com "[áudio não transcrito]" após o teto (Fase 4).

Proteções contra resposta errada (portadas de `turno-ja-respondido.ts`):

- **Marca d'água:** o turno grava a última inbound que viu antes de ler o contexto.
- **Resposta obsoleta:** no envio, se chegou inbound depois da marca, a resposta é descartada e um novo turno responde a tudo junto (até um teto de idade).
- **Já respondido:** se outro turno que viu a mesma inbound já enviou, este fica em silêncio.
- **Uma conversa, um turno:** fila serializada por conversa.

## B6. O turno em sete estágios

Cada estágio é um módulo com entrada e saída tipadas, testável sozinho.

| # | Estágio | Faz | Saída |
|---|---|---|---|
| 1 | Perceber | Carrega eventos desde a marca d'água, grava a marca, agrupa a rajada | `TurnInput` |
| 2 | Entender | Sinais por regra (opt-out, pedido de humano, urgência/dor, "1/2") e depois classificador barato (intenção, sentimento, pergunta clínica, tentativa de manipulação) | `TurnSignals` |
| 3 | Rotear | Política decide o modo: `deterministic` · `agent` · `handoff` · `silent` · `notify_staff`, a partir do controle, sinais, nível de autonomia e orçamento | `TurnPlan` |
| 4 | Deliberar | LLM com ferramentas (máx. 6 passos, timeout 45 s) | `Draft` (mensagens + comandos) |
| 5 | Verificar | Política de ação por comando + gates de saída; veto volta ao modelo (máx. 2) e depois fallback | `VerifiedDraft` |
| 6 | Efetivar | **Uma transação:** comandos executados ou propostos, mensagens no outbox, eventos, estado, trace, custo | `TurnResult` |
| 7 | Refletir | Job separado: resumo rolante, fatos do paciente, agenda follow-up, amostra para avaliação | eventos futuros |

Urgência (dor forte, sangramento, trauma) pula direto para `handoff` com aviso imediato à secretária e mensagem determinística ao paciente; o LLM não dá orientação clínica.

## B7. Contexto e prompt

Ordem fixa, com orçamento de tokens por seção:

- **Prefixo cacheável:** regras invariantes do assistente; perfil versionado da clínica (endereço, horários, procedimentos, política de remarcação, tom); definição das ferramentas.
- **Sufixo:** resumo rolante da conversa; fatos do paciente (com origem e validade); próximas consultas e lembretes; últimas N mensagens; sinais do turno; bloco de retomada (follow-up).

Minimização de dados: o paciente aparece pelo primeiro nome; CPF, telefone e ids internos nunca entram. Entidades viram **handles do turno** (`consulta_1`, `horario_3`) mapeados no servidor. O modelo não consegue inventar nem trocar ids de outro paciente ou clínica.

**Identidade (específico de clínica):** um telefone pode representar vários pacientes (mãe que agenda pelos filhos). `ConversationParticipant` liga a conversa a 0..n pacientes; com mais de um candidato, a ferramenta `identify_patient` faz o agente perguntar de quem é a consulta antes de qualquer ação. Número desconhecido → fluxo de novo contato (sem dados da agenda; oferece agendamento via secretária).

## B8. Ferramentas como comandos

Ferramenta = schema Zod → comando de domínio → política de autonomia (`execute` · `propose` · `deny`) → resultado ao modelo. Comandos são idempotentes por turno.

| Classe | Ferramentas | Risco |
|---|---|---|
| Leitura | `get_upcoming_appointments`, `list_free_slots`, `get_clinic_info`, `identify_patient` | nenhum |
| Ação leve | `confirm_appointment`, `register_opt_out` | baixo |
| Ação de agenda | `reschedule_appointment`, `cancel_appointment`, `request_booking` | alto (proposta até L4) |
| Controle | `handoff_to_human`, `schedule_followup`, `stay_silent`, `save_patient_fact` | — |

`send_message` não é ferramenta: o texto final do rascunho vai para o outbox depois dos gates. O modelo não decide *quando* enviar, só *o quê*.

## B9. Políticas e gates

Três camadas, funções puras, ordem fixa, cada avaliação registrada no trace:

- **Entrada:** detecção de opt-out, pedido de humano, urgência, tentativa de manipulação do prompt (marca, não bloqueia sozinha).
- **Ação:** autonomia da clínica para a classe; regras de agenda (antecedência mínima, horário de funcionamento, conflito, que o domínio já impede no banco).
- **Saída** (antes do outbox): `stop` (blocked/opt-out) → `consent` (LGPD) → `window` (horário da clínica) → `clinical_claim` (diagnóstico, prescrição, promessa de resultado) → `agenda_claim` (afirmar horário/confirmação sem comando bem-sucedido no turno) → `leak` (dado interno, de outro paciente, handles) → `promise` (prometer retorno humano sem handoff) → `format` (tamanho, bolhas, sem markdown) → `budget`.

Vereditos: `pass` · `veto(motivo)` (volta ao modelo) · `amend(texto)` (ex.: aviso de que é assistente virtual na primeira mensagem **[decidir texto]**).

## B10. Outbox e envio

O turno nunca chama o Evolution. Ele grava `OutboundMessage` (`planned`) na transação do estágio 6. O sender:

- usa uma fila por número de WhatsApp: um envio por vez, intervalo mínimo + jitter, teto diário, aquecimento de número novo, janela de horário;
- calcula atraso humano (tempo de "ler" + digitação proporcional ao texto, com piso e teto) e divide respostas longas em bolhas;
- refaz a checagem de resposta obsoleta e do gate `stop` **no momento do envio**;
- usa chave de idempotência; registra no `SendLedger` (o ledger também distingue mensagem da secretária de eco do sistema);
- trata `message.status`: falha → nova tentativa com backoff → alerta em Pendentes (reaproveita o padrão do M2).

Os lembretes passam pelo mesmo sender (A7).

## B11. Memória em quatro camadas

| Camada | Onde | Vida |
|---|---|---|
| Trabalho | contexto do turno | o turno |
| Episódica | `Conversation.summary` (resumo rolante) + cauda de mensagens | a conversa |
| Semântica | `PatientFact` (preferência de horário, ansiedade, quem agenda pela família) com origem, confiança e validade | o paciente |
| Procedural | `ClinicPlaybook` versionado (regras, tom, respostas aprovadas) | a clínica |

Compactação: quando a conversa passa do limite, primeiro extrai fatos duráveis (flush), depois resume. Fatos sensíveis de saúde não viram `PatientFact` automaticamente.

## B12. Observabilidade, replay e avaliação

- **`AgentTurn`:** cada estágio com duração, sinais, modo, chamadas de modelo (tokens, custo, modelo), ferramentas, vereditos, resultado. Sem PII nos logs; o conteúdo fica no banco, acessível pela clínica.
- **Replay:** reexecuta um turno com as entradas gravadas e respostas de modelo gravadas (cassete). Serve para depurar e para virar teste.
- **Suíte de cenários (`evals/scenarios/*.yaml`):** roteiro de mensagens do paciente + estado inicial + asserções (ferramenta chamada, nada enviado, handoff, gate disparado, rubrica de tom). Em CI roda com cassete (determinístico, grátis); à noite roda com o modelo real e um juiz LLM para a rubrica.
- **Todo incidente vira cenário** antes do conserto. A suíte é o critério para trocar modelo, prompt ou subir autonomia.

## B13. Modos de falha

| Falha | Tratamento |
|---|---|
| Webhook duplicado ou fora de ordem | Dedup por id do provedor; ordenação pelo timestamp do provedor |
| Worker cai no meio do turno | Job volta pela visibilidade; efetivação é uma transação só, então não há meio-turno |
| LLM lento ou fora | Timeout → reserva → mensagem determinística + aviso |
| LLM inventa horário | Só `list_free_slots` produz horários; `agenda_claim` veta texto sem comando |
| Paciente escreve enquanto o turno pensa | Resposta obsoleta descartada; novo turno responde tudo |
| Secretária e bot respondem juntos | `staff.message` cancela turno pendente; sender confere o controle de novo antes de enviar |
| Número desconectado ou banido | `channel.disconnected` pausa o sender do número + alerta |
| Orçamento estourado | Modo determinístico + aviso à clínica |
| Manipulação do prompt | Ferramentas só enxergam a própria conversa (handles); gates de saída valem igual |
| Telefone com vários pacientes | `identify_patient` obrigatório antes de ação |
| Mensagem de grupo, status, chamada | Ignorada no ingresso (registrada, sem turno) |

## B14. Dados novos

Todos com `organizationId` e registrados em `TENANT_MODELS`, exceto a fila (schema do worker).

- `WhatsappInstance` (clínica ↔ instância do Evolution, número, idade, teto diário, estado)
- `Conversation` (controle, fase, marca d'água, resumo, `silencedUntil`, autonomia efetiva)
- `ConversationParticipant` (conversa ↔ paciente, confirmado ou candidato)
- `WhatsappMessage` (direção, id do provedor único, tipo, texto, mídia derivada, status)
- `ConversationEvent` (tipo, payload, origem, `occurredAt`)
- `AgentTurn` (gatilho, estágios, modo, custo, resultado) e `ModelCall`
- `AgentCommand` (comando, args, decisão `execute/propose/deny`, resultado, quem aprovou)
- `OutboundMessage` + `SendLedger`
- `ScheduledFollowup`, `PatientFact`, `ClinicPlaybook` (versionado), `AutonomyPolicy`

## B15. Organização do código

```
lib/channel/         interface Channel + evolution/ (schemas do webhook, adaptador, normalização)
lib/conversation/    eventos, projeção de estado, transições, participantes
lib/agent/stages/    perceive, understand, route, deliberate, verify, commit, reflect
lib/agent/tools/     uma ferramenta por arquivo → chama lib/services
lib/agent/policy/    autonomia, gates de entrada/ação/saída
lib/agent/memory/    resumo, fatos, playbook, montagem de contexto
lib/llm/             gateway, orçamento, custo, cassete, registro de modelos
lib/outbox/          sender, pacing, atraso humano, ledger
worker/              entrada do processo e tarefas (turn, reflect, send, followup, derive-media)
evals/               cenários, runner, juiz
```

Regras: arquivos de 200–400 linhas (o turno de 6,4 mil linhas do DeskcommCRM é o contraexemplo); estágios sem acesso direto a rede; LLM e canal sempre injetados.

---

# Parte C — Plano tático

Tamanhos: P (≤ 2 dias), M (3–5), G (6–10). Cada fase termina com typecheck, lint, cobertura ≥ 80% e a suíte de cenários verde.

## Fase 0 — Fundação (M)

- **0.1** Spike graphile-worker × pg-boss: debounce por `jobKey`, serialização por conversa, retomada após `kill -9`, convivência com Prisma. *Aceite:* decisão registrada em `Context/`.
- **0.2** Contrato do Evolution na versão instalada: eventos (`messages.upsert`, `messages.update`, conexão, presença), autenticação do webhook, URL única ou por evento, eco de `fromMe`. *Aceite:* fixtures reais (anonimizadas) em `tests/fixtures/evolution/`.
- **0.3** Esqueleto do worker no compose (healthcheck, shutdown gracioso, logs estruturados).
- **0.4** Decisões pendentes: A7 (remetente único), teto de custo, texto de identificação do assistente.

## Fase 1 — Canal determinístico, fecha o M4 (G) — autonomia L0

- **1.1** Modelos `WhatsappInstance`, `Conversation`, `ConversationParticipant`, `WhatsappMessage`, `ConversationEvent` + projeção de estado.
- **1.2** Webhook: segredo, Zod, dedup, resolução de clínica, ignorar grupo/status.
- **1.3** Fila + debounce + marca d'água.
- **1.4** Outbox + sender com pacing, atraso humano, ledger, status de entrega.
- **1.5** Lembretes migrados para o sender (se A7 aprovado).
- **1.6** Respostas por regra: "1/confirmo" → confirma; "2/remarcar" → proposta para a secretária; "SAIR/parar" → opt-out; resto → "a clínica responde em breve" + notificação.
- **1.7** Tela de conversas (lista, histórico, assumir/devolver ao bot, responder pelo app).

*Aceite:* 5 mensagens em 3 s geram 1 turno; webhook reenviado não duplica; worker morto no meio retoma sem enviar duas vezes; opt-out bloqueia lembretes; mensagem da secretária pelo celular silencia o bot.

## Fase 2 — Cérebro em sombra (G) — L1

- **2.1** `lib/llm`: gateway, orçamento por clínica, custo, cassete, reserva.
- **2.2** Estágios 1–5 completos, só ferramentas de leitura.
- **2.3** Montagem de contexto com handles e minimização.
- **2.4** Gates de saída.
- **2.5** `AgentTurn` + tela de trace.
- **2.6** Sugestão ao lado da conversa, com botão "enviaria assim / não enviaria" (é a métrica de L1).
- **2.7** Suíte de cenários (≥ 40 cenários pt-BR: confirmar, remarcar, preço, endereço, urgência, família, manipulação, áudio, rajada) + escolha do modelo.

*Aceite:* suíte verde com cassete; rodada real com custo medido por turno; nenhum envio automático possível em L1 (teste).

## Fase 3 — Copiloto e autonomia informativa (M) — L2 → L3

- **3.1** Envio com um clique (e edição registrada como sinal de avaliação).
- **3.2** `AutonomyPolicy` por clínica/classe + disjuntor de rebaixamento.
- **3.3** Ações como proposta: `AgentCommand` em Pendentes, aprovação gera `proposal.decided` → turno que avisa o paciente.
- **3.4** Handoff completo (ferramenta, regras, TTL, aviso à secretária).

*Aceite:* proposta aprovada altera a agenda pelo serviço normal (mesmas validações); recusada gera resposta coerente; incidente simulado rebaixa a clínica.

## Fase 4 — Ciclo proativo (G) — L3 → L4

- **4.1** `followup.due`: a IA agenda retomada ("vou te lembrar amanhã"), bloco de retomada com tempo decorrido e promessa.
- **4.2** `appointment.changed` → avisa o paciente quando a clínica remarca.
- **4.3** Recuperação de falta: consulta marcada como falta → oferta de novo horário (respeitando consentimento e janela).
- **4.4** Reflexão: resumo rolante, flush de fatos, compactação.
- **4.5** Mídia: transcrição de áudio.
- **4.6** L4 para confirmar e opt-out.

*Aceite:* cenário de 5 dias (pergunta → silêncio → follow-up → remarcação → lembrete) passa em replay com relógio controlado.

## Fase 5 — Aprendizado (M)

- **5.1** Avaliação noturna com juiz sobre amostra de turnos reais.
- **5.2** Propostas de ajuste do playbook geradas a partir de edições e reprovações; a clínica publica (nunca automático).
- **5.3** Painel por clínica: faltas, confirmações, resolução sem humano, custo, nível de autonomia.

## Fase 6 — Conhecimento e crescimento (G)

- **6.1** Base de conhecimento da clínica (pgvector): FAQ, procedimentos, preços autorizados.
- **6.2** Lista de espera: cancelamento → oferta do horário a quem espera.
- **6.3** Reativação de pacientes sem consulta há X meses (campanha com pacing e consentimento).

## Dependências e riscos

- A Fase 1 entrega valor sozinha (M4 + caixa de conversas) e trava as demais: sem fila, outbox e estado, nenhum LLM entra.
- Risco de banimento: o sender da Fase 1 já nasce com pacing; nenhum envio contorna o outbox.
- LGPD: base legal e aviso de assistente virtual antes da Fase 2 com dados reais; CPF nunca no prompt; provedor de LLM registrado como operador.
- Servidor caseiro: fila no Postgres + transação única por turno tornam queda recuperável; backups passam a ser obrigatórios antes da primeira clínica com IA.

## Pendências de decisão

1. **A7** — lembretes também pelo sender do worker (substitui o n8n no M3).
2. Teto de custo de IA por clínica.
3. Limiares da escada de autonomia (A3).
4. Texto de identificação do assistente virtual na primeira mensagem.
