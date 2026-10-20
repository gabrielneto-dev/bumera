# Context — Project Memory Manual

`Context/` is the persistent, searchable memory of the project. Sessions are disposable; this folder is not. **SESSION ≠ MEMORY.**
`AGENTS.md` says HOW to work; `Context/` says WHAT the project knows.

## Structure

```
Context/
├── MAP.md  STATE.md          L0: routing + current state (keep small)
├── core/                     overview, goals, constraints, glossary (stable)
├── branches/<branch>/        L1 _index.md + L2 atomic records
│     facts/ research/ decisions/ assumptions/ questions/ plans/ risks/ experiments/ notes/
├── global/                   cross-cutting decisions, assumptions, questions, plans, risks
├── checkpoints/              CP-YYYYMMDD-HHMM-<slug>.md session snapshots
├── sources/                  L3 provenance/evidence
├── future/                   candidate ideas (not decisions, not plans)
├── archive/                  historical, no longer active
└── _meta/                    config.yaml, taxonomy.yaml, catalog.jsonl, changelog.md, templates/
```

Create a branch only when a real, relatively independent knowledge area exists. Directories may be omitted when empty.

## Source of truth

Markdown records are canonical. `_meta/catalog.jsonl` is derived: if it diverges, rebuild it from the records' frontmatter.

## Record types

FCT fact · RES research · DEC decision · ASM assumption · QUE question · PLN plan · RSK risk · NTE note · SRC source · SUM summary · EXP experiment · CP checkpoint.
Never conflate them: a hypothesis is not a fact, research is not a decision, a future idea is not a plan.

## Metadata schema (YAML frontmatter)

Required: `id, type, title, branch (or "global"), tags, status, created_at, updated_at`.
Optional: `confidence (low|medium|high|verified), source_ids, related, depends_on, supersedes, superseded_by, valid_from, valid_until, revisit_at`.
IDs: `CTX-<TYPE>-<YYYYMMDD>-<slug>` (checkpoints: `CTX-CP-YYYYMMDD-HHMM-<slug>`). IDs are stable even if files move; never duplicate.
Files: `<TYPE>-<YYYYMMDD>-<kebab-slug>.md`. Tags: kebab-case, canonical forms in `_meta/taxonomy.yaml` (reuse before inventing).

## Retrieval protocol (progressive loading)

1. Extract objective, entities, likely branches/tags, needed knowledge type, temporality.
2. Read `MAP.md` and `STATE.md` only.
3. Read `_index.md` of relevant branches only.
4. Search targeted: `rg "<keyword>" Context/`, `rg "type: decision" Context/`, `rg "status: open" Context/`.
5. Expand relations (`related`, `depends_on`, `source_ids`, supersession) 1 hop; deeper only if needed.
6. Prefer `active` records; never treat `superseded/deprecated/archived` as current without checking the successor.
7. Open `sources/` (L3) only when evidence or validation is needed.

## Persistence protocol — "salvar contexto"

Triggered by semantic intent (salvar/persistir/atualizar contexto, save context, checkpoint…), not by exact string.
Do NOT summarize the chat. Reconstruct: objective, work done, problems & causes, failed approaches worth remembering, validated solutions, decisions + why, changes/files, tests, new facts/assumptions/questions, answered questions, risks, next steps, obsolete info, durable operating rules. In versioned projects, verify with VCS state/diff.

Filter: *would a fresh agent need this to continue, avoid rework, or decide better?* No → discard. Never save greetings, trivia, verbatim chat.

Pipeline: inspect changes → analyze → distill → classify → deduplicate (search first; update existing rather than duplicate) → relate → create/update atomic records → create checkpoint → update `STATE.md` → update branch `_index.md` → update `MAP.md` if needed → update `catalog.jsonl` → update `_meta/changelog.md` if structure changed → evaluate `AGENTS.md` rules (durable HOW-to-work rules only) → validate (unique IDs, valid relations, no secrets).

Failed approaches: record only when someone might plausibly repeat them (approach, conditions, result, cause, when to retry).

## Checkpoints

`checkpoints/CP-YYYYMMDD-HHMM-<slug>.md`, template in `_meta/templates/checkpoint.md`. A continuity snapshot, not a substitute for atomic records. After saving, update `STATE.md` (present only) with `Latest checkpoint`.

## Supersession, conflicts, archive

Never silently delete important records. Old: `status: superseded`, `superseded_by: <id>`; new: `supersedes: <id>`. Move to `archive/` when no longer active but historically valuable. For conflicting info compare date, status, scope, source, confidence, later decisions; if unresolved, create/update a `question`. Answered questions stay with `status: answered`, answer, evidence, `resolved_by`.

## Semantic commands

- `salvar contexto` — full persistence + checkpoint.
- `carregar contexto` — explicitly load MAP, STATE, relevant branches.
- `buscar contexto <assunto>` — search tags/titles/content/IDs/relations, most relevant first.
- `status do contexto` — current state, latest checkpoint, branches, critical questions, blockers.
- `auditar contexto` — structural maintenance (below).

## Adding a branch

Create `branches/<name>/_index.md` (purpose, scope, state, key concepts, active decisions, open questions, risks, relations, routes) plus needed type subfolders; add to `MAP.md`; add tags to taxonomy; log in `_meta/changelog.md`.

## Audit checklist

Duplicate/missing IDs · broken relations · synonym tags · contradictory records · wrong statuses (resolved but open, superseded shown active) · oversized indexes/records (split) · unclassified records · missing sources · stale MAP · STATE turned into history · catalog divergence (rebuild) · duplicated rules in AGENTS/CLAUDE · accidentally persisted secrets.

## Security

Never store passwords, tokens, API keys, private keys, cookies, recovery codes. Env-var *names* and secret-manager locations are OK. If a secret is found, do not replicate it; mask it.
