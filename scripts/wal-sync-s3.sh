#!/usr/bin/env bash
set -euo pipefail
# WAL -> S3 (PITR): copia o archive do volume p/ host, sync S3 (idempotente, SEM --delete:
# WAL nunca expira aqui — lifecycle do bucket cuida), poda >48h dos dois lados (S3 ja tem).
# Roda no EC2 (cron */5). O archive vive DENTRO do volume do pgdata — sobrevive a recreate.
CONTAINER="${POSTGRES_CONTAINER_NAME:-janocaminho-postgres}"
SRC="/var/lib/postgresql/data/wal-archive"
HOST_DIR="${WAL_HOST_DIR:-$HOME/wal-archive}"
S3_BUCKET="${BACKUP_S3_BUCKET:-jnc-db-backups-prod-222984221398}"
S3_PREFIX="${BACKUP_S3_WAL_PREFIX:-wal/janocaminho-postgres}"
mkdir -p "$HOST_DIR"
docker cp "$CONTAINER:$SRC/." "$HOST_DIR/" >/dev/null 2>&1 || true
aws s3 sync "$HOST_DIR" "s3://${S3_BUCKET}/${S3_PREFIX}/" --only-show-errors --sse AES256 >/dev/null
find "$HOST_DIR" -name '0000000*' -mtime +2 -delete 2>/dev/null || true
docker exec "$CONTAINER" sh -c "find $SRC -name '0000000*' -mtime +2 -delete" 2>/dev/null || true
