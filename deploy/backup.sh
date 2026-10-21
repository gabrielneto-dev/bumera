#!/usr/bin/env bash
# Daily logical backup of the Bumera databases from the shared Postgres (read-only: pg_dump).
# Installed on the server as ~/bumera-app/backup.sh and scheduled by the owner's crontab.
set -euo pipefail

DATABASES=(bumera_prod evolution)
DEST="$HOME/backups/bumera"
KEEP_DAYS=14
CONTAINER=infra-postgres

umask 077
mkdir -p "$DEST"
stamp="$(date +%F_%H%M)"

for db in "${DATABASES[@]}"; do
  out="$DEST/${db}_${stamp}.dump"
  docker exec "$CONTAINER" pg_dump -U admin -Fc "$db" > "$out.partial"
  # A dump that cannot be listed is not a backup.
  docker exec -i "$CONTAINER" pg_restore --list < "$out.partial" > /dev/null
  mv "$out.partial" "$out"
  echo "$(date -Is) ok $(basename "$out") $(stat -c %s "$out") bytes"
done

find "$DEST" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
