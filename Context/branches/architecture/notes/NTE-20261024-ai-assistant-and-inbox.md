---
id: CTX-NTE-20261024-ai-assistant-and-inbox
type: note
title: Módulo 4: caixa de mensagens, assistente de IA por clínica, chave criptografada e avaliação de modelos
branch: architecture
tags: [ai-assistant, llm, openrouter, privacy, security, architecture]
status: superseded
confidence: high
created_at: 2026-10-24
updated_at: 2026-10-24
related: [CTX-NTE-20261021-m4-inbound-replies, CTX-NTE-20261024-booking-dialog, CTX-DEC-20261024-ai-booking-rules, CTX-NTE-20261022-lgpd-audit-export-erasure]
superseded_by: CTX-DEC-20261026-whatsapp-in-n8n
---

# Assistente de IA (commits 7df4991, 673f185, 51ec8d7 e anteriores; migrations 20261022160000_m6_inbox_ai, 20261022170000_ai_api_key)

## Caixa de mensagens (sem IA)
Texto livre de paciente conhecido que nenhuma palavra-chave explica vira `inbound_message` (motivo UNRECOGNIZED | URGENT | AI_UNSURE | AI_UNAVAILABLE | AI_ANSWERED), aparece em Pendentes ("Mensagens para responder", urgentes em destaque) e recebe `REPLY_HANDOFF`. `lib/inbound/free-text.ts` `receiveFreeText`; urgência por `lib/inbound/urgent.ts` (palavras de dor/emergência), nunca vai à IA. O texto some do banco quando a mensagem é tratada.

## IA por clínica (opt-in)
- `clinic_settings`: `aiEnabled` (+ aceite de privacidade, `aiEnabledAt`), `clinicInfo` (texto que a clínica escreve: endereço, horários, pagamento), chave OpenRouter criptografada (`aiApiKeyEncrypted`, só os 4 últimos dígitos aparecem, campo só de escrita). Tela admin "Assistente". `lib/ai/clinic.ts` `clinicAi` devolve o cliente só se a clínica ligou e tem chave (ou a chave do servidor `OPENROUTER_API_KEY`); sem isso nada sai para o provedor.
- `lib/ai/openrouter.ts`: `interpret` (YES/NO/STOP/QUESTION/BOOK/OTHER + confiança + resposta), `understandTurn` e `phrase` (diálogo de agendamento, ver `CTX-NTE-20261024-booking-dialog`). `provider.data_collection: "deny"`, `reasoning: {enabled:false}` (o Haiku 5.5 gastava o orçamento de tokens "pensando" e cortava o JSON).
- Proteções: `maskPersonalData` (CPF, telefone, e-mail, nome do paciente) antes de enviar; `looksLikeInjection` (texto que fala com a IA nem é enviado); limiares de confiança (YES/NO 0,85, STOP 0,9, resposta 0,8, BOOK 0,85); a IA só responde sozinha com base em `clinicInfo`, sem preço/diagnóstico/promessa; teto de 100 chamadas/dia/clínica para texto livre; falha do provedor = secretária.
- Modelo: `anthropic/claude-haiku-5.5` (`DEFAULT_AI_MODEL`, sobrescrevível por `AI_MODEL`). `scripts/ai-eval.ts` + `ai-eval-set.json` (38 casos pt-BR): 37/38 (o erro era um rótulo desatualizado, corrigido). gpt-4o-mini obedeceu injeção; qwen3.7-flash devolveu vazio; mistral-small bateu 429. Rodar na produção: `docker compose --profile tools run --rm migrate npx tsx scripts/ai-eval.ts --from-db --models <modelo>` (usa a chave salva da clínica, nunca imprime).
- Auditoria: `PATIENT_MESSAGE_ANSWERED_BY_AI` no log de atividades (só a intenção, sem texto).

## Limites conhecidos
Áudio não é lido; a IA não vê o histórico (só o estado atual); cada resposta do diálogo usa 2 chamadas (~2 s); dados que o paciente digita fora de nome/telefone (ex.: nome numa frase livre da 1ª mensagem) podem ir ao provedor, daí o aceite de privacidade no opt-in.

## Superseded (2026-10-26)
Code removed: the assistant, inbox and AI key moved out of the app (AI lives in n8n).
