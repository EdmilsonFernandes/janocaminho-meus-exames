#!/usr/bin/env sh
# Backup do banco meus_exames (dump SQL comprimido). Não derruba o container.
# Opcional: envia p/ S3 se BACKUP_S3_BUCKET estiver definido (estilo EdEspeto).
# Uso:  sh scripts/pg-backup.sh   ou  BACKUP_S3_BUCKET=meu-bucket sh scripts/pg-backup.sh
set -e

PG_CONTAINER="${PG_CONTAINER:-janocaminho-postgres}"
DB_NAME="${DB_NAME:-meus_exames}"
DB_USER="${DB_USER:-postgres}"
OUT_DIR="${BACKUP_DIR:-./backups}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_PREFIX="${BACKUP_S3_PREFIX:-postgres/${DB_NAME}}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${OUT_DIR}/${DB_NAME}-${TS}.sql.gz"

mkdir -p "$OUT_DIR"
echo "💾 Backup de '${DB_NAME}' → ${FILE}"
docker exec -e PGPASSWORD="${PGPASSWORD:-}" "$PG_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges 2>/dev/null | gzip > "$FILE"

echo "✅ Dump salvo: $(ls -la "$FILE" | awk '{print $5}') bytes"

# Upload S3 (opcional)
if [ -n "$S3_BUCKET" ]; then
  if ! command -v aws >/dev/null 2>&1; then echo "⚠️  aws CLI ausente — pulando S3." >&2; exit 0; fi
  S3_URI="s3://${S3_BUCKET%/}/${S3_PREFIX#/}/${DB_NAME}-${TS}.sql.gz"
  echo "☁️  subindo p/ ${S3_URI}"
  aws s3 cp "$FILE" "$S3_URI" --only-show-errors --sse AES256 --storage-class STANDARD
  echo "✅ S3 OK"
fi
