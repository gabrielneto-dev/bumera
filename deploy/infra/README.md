# Infra genérica do servidor (`~/infra` no `my-server`)

Postgres 16 + pgAdmin + n8n em um compose próprio (`name: infra`), **independente de qualquer projeto**.
Cada projeto ganha o próprio banco e usuário; nenhum enxerga o banco do outro.
Esta pasta é a cópia versionada de `~/infra` (sem segredos: o `.env` real fica só no servidor, permissão 600).

| Serviço | Container | Endereço no servidor | Acesso do seu computador |
|---|---|---|---|
| Postgres | `infra-postgres` | `127.0.0.1:5432` | `npm run db:tunnel` → `localhost:5433` |
| pgAdmin | `infra-pgadmin` | `127.0.0.1:5050` | `npm run ui:tunnel` → http://localhost:5050 |
| n8n | `infra-n8n` | `127.0.0.1:5678` | `npm run ui:tunnel` → http://localhost:5678 |

Tudo escuta só em `127.0.0.1` do servidor: o acesso é por túnel SSH (nada exposto na rede).

## Subir / atualizar
```bash
ssh my-server 'cd ~/infra && docker compose up -d'
```
As imagens estão fixadas (n8n por versão, pgAdmin por digest); atualize de propósito, não por acidente.

## Novo projeto (banco + usuário próprios)
```bash
ssh my-server '~/infra/scripts/new-db.sh meu_projeto --with-test'
```
Cria o usuário `meu_projeto` (sem superusuário), o banco `meu_projeto` e, com `--with-test`, `meu_projeto_test`.
A senha vai para `~/infra/projects/meu_projeto.env` (permissão 600), com a `DATABASE_URL` pronta. Nada é impresso.
Os bancos nascem fechados: só o dono (e o superusuário `admin`) conecta.

Um projeto que roda em container entra na rede da infra e usa o host `postgres`:
```yaml
networks:
  default:
    name: infra
    external: true
```

## Segredos (só no servidor, `~/infra/.env`)
`POSTGRES_PASSWORD` (superusuário `admin`), `PGADMIN_PASSWORD` (login `admin@infra.dev`) e `N8N_ENCRYPTION_KEY`.
**Faça backup da `N8N_ENCRYPTION_KEY` fora do servidor**: sem ela, as credenciais salvas no n8n ficam ilegíveis.

## Histórico
- 2026-10-21: o Postgres/pgAdmin/n8n que viviam em `~/bumera` foram migrados para cá. Os bancos `bumera_dev` e `bumera_test`
  foram restaurados com o mesmo usuário `bumera` e a mesma senha (URLs do app não mudaram).
  O stack antigo está **parado, não removido** (`~/bumera/compose.yml`, volumes `bumera_bumera_*`) como backup.
  Dumps da migração: `~/infra/migration-bumera/`.
