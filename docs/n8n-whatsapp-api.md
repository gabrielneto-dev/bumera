# API do Bumera para os workflows de WhatsApp no n8n

Desde 2026-10-26 a conversa no WhatsApp vive no n8n (`CTX-DEC-20261026-whatsapp-in-n8n`). O app guarda os dados e decide os fatos: horários livres, cadastro, confirmação e opt-out. O n8n conversa com o paciente, usa a IA e envia pelo Evolution.

Base: `http://bumera-app:3000` (rede docker `infra`). Todas as rotas exigem o cabeçalho `Authorization: Bearer <SERVICE_API_KEY>` (credencial "Bumera service key" no n8n). Sem a chave configurada a resposta é 503; com a chave errada, 401.

Toda resposta usa o envelope `{ "success": bool, "data": ..., "error": { "code", "message" } | null, "meta": ... }`. Códigos de erro: 400 `VALIDATION`, 404 `NOT_FOUND`, 409 (`SLOT_TAKEN`, `OUTSIDE_WORKING_HOURS`, `PAST_APPOINTMENT`, `INACTIVE_RESOURCE`...), 413 `TOO_LARGE`, 500 `INTERNAL`.

O telefone vai como o WhatsApp manda: só dígitos (`5511987654321`), com ou sem `+`. O app também acha os números de contas antigas, salvos sem o nono dígito.

## Lembretes

Workflow "Bumera - Lembretes por WhatsApp (v2)". O app decide **quem** recebe e **quando**; o workflow decide **o texto**: um nó "Texto: ..." por tipo (`CONFIRMATION`, `REMINDER_24H`, `REMINDER_2H`, `NO_SHOW_FOLLOWUP`, `REACTIVATION`, `QUOTE_FOLLOWUP_1`, `QUOTE_FOLLOWUP_2`).

| Rota | O que faz |
|---|---|
| `GET /api/v1/reminders/due?limit=1..50` | Entrega e reserva os lembretes devidos (todas as clínicas). Respeita horário de silêncio, limite diário, consentimento e opt-out. |
| `POST /api/v1/reminders/{id}/result` | `{"outcome":"sent","attempt":N}` ou `{"outcome":"failed","attempt":N,"error":"..."}`. Pode repetir sem efeito duplicado. |

Cada lembrete traz os dados para o texto, já formatados e sem links nem formatação vindos de cadastros:
```json
{
  "id": "...", "kind": "REMINDER_24H", "attempt": 1,
  "clinic": { "id": "org_...", "name": "Odonto Company" },
  "patient": { "id": "...", "firstName": "Pedro", "phone": "+5511900001111", "dependent": true, "guardianFirstName": "Maria" },
  "appointment": { "id": "...", "startsAt": "...", "endsAt": "...", "day": "sábado, 31/10", "time": "09:00", "dentistName": "Dra. Ana", "procedureName": "Avaliação" },
  "quote": null,
  "whatsapp": { "instance": "bumera-teste" }
}
```
- Dependente (`dependent: true`): a mensagem vai para o telefone do responsável, cumprimenta `guardianFirstName` e fala do paciente (`firstName`).
- `appointment` é `null` nos orçamentos; `quote` é `null` nos demais. Na retomada, `appointment` é o último atendimento.
- `message` (o texto antigo, montado pelo app) ainda vem enquanto o workflow antigo existir e será removido.

## Conversa

### `GET /api/v1/clinics/by-instance/{instance}`
Diz de qual clínica é o número que recebeu a mensagem (`instance` do webhook do Evolution).
```json
{ "id": "org_...", "name": "Odonto Company", "info": "Rua A, 10. Seg a sex, 8h-18h.", "bookingEnabled": true }
```
- `info`: o texto da tela WhatsApp. A IA só deve responder dúvidas com base nele.
- `bookingEnabled`: se o atendimento pode guiar contatos novos até um pedido de consulta.

### `GET /api/v1/clinics/{clinicId}/contact?phone=5511987654321`
Diz quem está por trás do telefone nessa clínica. Traz só o primeiro nome: nunca o nome completo, o CPF ou a data de nascimento.
```json
{
  "known": true,
  "optedOut": false,
  "patients": [{ "id": "...", "firstName": "Maria", "dependent": false }],
  "upcoming": [{ "id": "...", "startsAt": "2026-10-28T13:00:00.000Z", "status": "SCHEDULED", "dentist": "Dra. Ana", "procedure": "Limpeza", "patientFirstName": "Maria", "rescheduleRequested": false }],
  "awaitingAnswer": "appointment"
}
```
- `optedOut: true` significa que a pessoa pediu para sair: não mande nada além da confirmação do SAIR.
- `awaitingAnswer` diz a que um "1"/"sim" responderia: `appointment` (lembrete de consulta), `campaign` (reativação ou orçamento) ou `null`.

### `POST /api/v1/clinics/{clinicId}/answers`
Aplica a resposta do paciente e devolve o texto a enviar. Pode repetir sem efeito duplicado.
```json
{ "phone": "5511987654321", "answer": "CONFIRM" }
```
`answer`: `CONFIRM` ("1", "sim, confirmo"), `RESCHEDULE` ("2", "preciso remarcar") ou `OPT_OUT` ("SAIR", "parar"). Resposta:
```json
{ "outcome": "CONFIRMED", "appointmentId": "...", "reply": "Olá, Maria!\n\nConsulta confirmada ✅ ..." }
```
`outcome`: `CONFIRMED`, `RESCHEDULE_REQUESTED` (vai para Pendentes), `INTERESTED`/`DECLINED` (resposta a campanha), `OPTED_OUT`, `NO_APPOINTMENT` ou `UNKNOWN_PATIENT` (nesses dois, `reply` é `null` e o workflow decide o que dizer). Um SAIR vale para todos os cadastros daquele telefone **nesta clínica** e cancela os lembretes pendentes.

### `GET /api/v1/clinics/{clinicId}/procedures`
Lista os procedimentos que podem ser agendados: `[{ "id", "name", "durationMin" }]`. Um procedimento que não está na lista não pode ser agendado pelo WhatsApp.

### `GET /api/v1/clinics/{clinicId}/slots?procedureId=...&offset=0&limit=3`
Devolve os próximos horários livres reais: a partir de 2 h à frente, até 14 dias, o primeiro da manhã e o primeiro da tarde de cada dentista por dia.
Filtros opcionais: `weekdays=1,3` (0 = domingo), `period=morning|afternoon` e `fromHour=0..23`. `limit` vai até 10.
```json
{ "slots": [{ "startsAt": "...", "dentistId": "...", "dentistName": "Dra. Ana", "label": "terça-feira, 28/10 às 10:00" }], "hasMore": true }
```
O workflow nunca inventa horário: só oferece os desta lista.

### `POST /api/v1/clinics/{clinicId}/booking-requests`
Registra o pedido como consulta **PENDENTE**, que a secretária aprova em Pendentes.
```json
{ "phone": "5511987654321", "procedureId": "...", "dentistId": "...", "startsAt": "<startsAt de /slots>", "forSelf": true, "name": "Ana Souza" }
```
- `forSelf: true`:
  - se o telefone já é de um paciente adulto, a consulta fica no cadastro dele;
  - se não é, `name` é obrigatório e o app cria um cadastro pendente, com o consentimento registrado na conversa.
- `forSelf: false`:
  - `personName` (o nome do paciente) é obrigatório;
  - o paciente vira um dependente desse telefone, e quem escreve (o adulto já cadastrado ou `name`) é o responsável que recebe os avisos.

Resposta: `{ "appointmentId", "patientId", "status": "PENDING", "startsAt" }`. Se der `409 SLOT_TAKEN`, alguém ocupou o horário: chame `/slots` de novo e ofereça outros.

## Regras para os workflows

- A IA do n8n não decide fatos: horários vêm de `/slots`, procedimentos de `/procedures` e confirmações de `/answers`.
- Não mande ao provedor de IA nomes, CPF, telefone ou e-mail da pessoa.
- Respeite `optedOut` e encaminhe urgências (dor forte, sangramento, trauma) para a equipe sem resposta da IA.
- Junte mensagens seguidas antes de responder (debounce). Comandos ("1", "2", "SAIR", "recomeçar") só valem como mensagem inteira, e "SAIR" vence qualquer outra mensagem do mesmo bloco.
