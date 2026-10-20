---
id: CTX-RES-20261017-openrouter-model-shortlist
type: research
title: OpenRouter: modelos baratos candidatos para interpretar mensagens curtas em português
branch: product
tags: [llm, openrouter, pricing]
status: active
confidence: low
created_at: 2026-10-17
updated_at: 2026-10-17
related: [CTX-QUE-20261016-llm-usage-in-pilot, CTX-RSK-20261014-lgpd-patient-data]
source_ids: [CTX-SRC-20261017-openrouter-pricing-articles]
---

# Research

## Question investigated
Which OpenRouter model offers good quality at low cost for classifying short Portuguese WhatsApp replies (e.g. "confirmo", "quero remarcar pra sexta") in the pilot?

## Scope and date
Web search on 2026-10-17; third-party blogs and aggregator pages only. No Portuguese-specific benchmark found. Fetching OpenRouter's model API returned no usable price data. Sources: `CTX-SRC-20261017-openrouter-pricing-articles`.

## Findings (unverified; sources disagree)
- DeepSeek V4 Flash: about $0.05–0.06 input / $0.18–0.24 output per 1M tokens (conflicting listings). Cheapest paid candidate.
- Gemini 3.5 Flash: about $0.16 input per 1M tokens.
- Step 3.7 Flash about $0.20/$1.15; GPT-5.6 Luna sources conflict ($0.20/$1.20 vs $1/$6).
- Mistral Nemo is described as multilingual including Portuguese; current price not found.
- `:free` models are rate-limited (reported 50 requests/day without credits, 1,000/day with $10+) and can be withdrawn: a poor fit for something clinics depend on.
- Cost order of magnitude: classifying short messages is tiny; about 1M messages costs a few dollars at the cheapest models.

## Limitations
Prices volatile and from blogs; confirm on openrouter.ai. No pt-BR quality evidence.

## Implications
Do not choose by price alone: build a small labeled set of real pt-BR clinic replies and test 3–4 candidates (e.g. DeepSeek V4 Flash, a Gemini Flash, Mistral Nemo) on accuracy, latency and cost. Patient messages are personal data sent to a third party: mask CPF and identifiers before sending (`CTX-RSK-20261014-lgpd-patient-data`). Also avoid LLM for flows that buttons/keywords can handle.

## Open questions
`CTX-QUE-20261016-llm-usage-in-pilot`
