#!/usr/bin/env bash
# Cria um banco e um usuario dedicados para um projeto (e, com --with-test, o banco <nome>_test).
# Uso: ~/infra/scripts/new-db.sh <nome> [--with-test]
# A senha gerada vai para ~/infra/projects/<nome>.env (permissao 600); nada e impresso.
set -euo pipefail
name="${1:-}"; flag="${2:-}"
[[ "$name" =~ ^[a-z][a-z0-9_]{1,30}$ ]] || { echo "nome invalido: use letras minusculas, numeros e _ (2-31 caracteres)"; exit 1; }
out="$HOME/infra/projects/$name.env"
[ ! -e "$out" ] || { echo "ja existe: $out"; exit 1; }
pw="$(openssl rand -base64 30 | tr -d "/+=\n" | cut -c1-32)"
dbs=("$name"); [ "$flag" = "--with-test" ] && dbs+=("${name}_test")
sql="CREATE ROLE \"$name\" LOGIN NOSUPERUSER CREATEDB PASSWORD :'pw';"
for d in "${dbs[@]}"; do sql+=" CREATE DATABASE \"$d\" OWNER \"$name\"; REVOKE CONNECT ON DATABASE \"$d\" FROM PUBLIC;"; done
docker exec -i infra-postgres psql -U admin -d postgres -v ON_ERROR_STOP=1 -v pw="$pw" <<<"$sql" >/dev/null
umask 077
{ echo "# Projeto $name — acessos ao Postgres da infra (host do servidor: 127.0.0.1:5432; na rede docker \"infra\": postgres:5432)"
  for d in "${dbs[@]}"; do echo "DATABASE_URL_${d^^}=postgresql://$name:$pw@127.0.0.1:5432/$d"; done; } > "$out"
echo "criado: banco(s) ${dbs[*]} e usuario $name -> $out"
