#!/usr/bin/env bash
set -euo pipefail
# Backup do banco "meus_exames" (no janocaminho-postgres) -> .sql.gz -> S3 (com rotacao).
# Mesmo padrao do EdEspeto. Roda no EC2 (cron diario); pula se ja fez ha < MIN_INTERVAL_HOURS.
# S3 via role da instancia (sem chaves no env). Bucket/prefix configuraveis.

CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-janocaminho-postgres}"
DB_NAME="${PGDATABASE:-meus_exames}"
USER_NAME="${PGUSER:-postgres}"
OUT_DIR="${BACKUP_DIR:-$HOME/backups/meus-exames}"
S3_BUCKET="${BACKUP_S3_BUCKET:-jnc-db-backups-prod-222984221398}"
S3_PREFIX="${BACKUP_S3_PREFIX:-postgres/${DB_NAME}}"
S3_STORAGE_CLASS="${BACKUP_S3_STORAGE_CLASS:-STANDARD}"
S3_SSE="${BACKUP_S3_SSE:-AES256}"
MIN_INTERVAL_HOURS="${MIN_INTERVAL_HOURS:-24}"
KEEP_LATEST="${KEEP_LATEST:-1}"

mkdir -p "$OUT_DIR"
pattern="${OUT_DIR}/${DB_NAME}_*.sql.gz"
latest="$(ls -1t ${pattern} 2>/dev/null | head -n 1 || true)"
if [ -n "$latest" ]; then
  now="$(date -u +%s)"; last="$(stat -c %Y "$latest" 2>/dev/null || echo 0)"
  age="$((now - last))"; min_seconds="$((MIN_INTERVAL_HOURS * 3600))"
  if [ "$age" -lt "$min_seconds" ]; then echo "Skip: backup tem ${age}s (< ${min_seconds}s)."; exit 0; fi
fi

ts="$(date -u +%Y%m%dT%H%M%SZ)"; out="$OUT_DIR/${DB_NAME}_${ts}.sql.gz"; checksum="$out.sha256"
echo "Backup de $DB_NAME ($CONTAINER_NAME) -> $out"
docker exec "$CONTAINER_NAME" sh -lc "pg_dump -U \"$USER_NAME\" -d \"$DB_NAME\" --no-owner --no-privileges" | gzip -9 > "$out"
test -s "$out" && gzip -t "$out"
command -v sha256sum >/dev/null 2>&1 && ( cd "$OUT_DIR" && sha256sum "$(basename "$out")" > "$(basename "$checksum")" ) || true

if [ -n "$S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
  s3uri="s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$out")"
  echo "Enviando p/ $s3uri"
  aws s3 cp "$out" "$s3uri" --only-show-errors --sse "$S3_SSE" --storage-class "$S3_STORAGE_CLASS"
  [ -f "$checksum" ] && aws s3 cp "$checksum" "s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$checksum")" --only-show-errors --sse "$S3_SSE"
  echo "S3 ok: $s3uri"
fi
echo "Backup concluido: $out"

if [ "$KEEP_LATEST" = "1" ]; then
  ls -1t ${pattern} 2>/dev/null | tail -n +2 | while IFS= read -r old; do rm -f -- "$old" "$old.sha256"; done
fi
