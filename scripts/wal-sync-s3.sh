#!/usr/bin/env bash
set -euo pipefail
# WAL -> S3 (PITR): copia o archive do volume p/ host, sync S3 (idempotente, SEM --delete:
# WAL nunca expira aqui — lifecycle do bucket cuida), poda >6H dos dois lados (S3 ja tem
# tudo; retencao local curta é OBRIGATORIA: com archive_timeout o banco gera 16MB por
# segmento mesmo vazio — o corte de 48h encheu o disco da EC2 a 100% e derrubou o
# Postgres em 29/08. 6h = teto local ~1GB).
# Roda no EC2 (cron */5). O archive vive DENTRO do volume do pgdata — sobrevive a recreate.
CONTAINER="${POSTGRES_CONTAINER_NAME:-janocaminho-postgres}"
SRC="/var/lib/postgresql/data/wal-archive"
HOST_DIR="${WAL_HOST_DIR:-$HOME/wal-archive}"
S3_BUCKET="${BACKUP_S3_BUCKET:-jnc-db-backups-prod-222984221398}"
S3_PREFIX="${BACKUP_S3_WAL_PREFIX:-wal/janocaminho-postgres}"
mkdir -p "$HOST_DIR"
docker cp "$CONTAINER:$SRC/." "$HOST_DIR/" >/dev/null 2>&1 || true
aws s3 sync "$HOST_DIR" "s3://${S3_BUCKET}/${S3_PREFIX}/" --only-show-errors --sse AES256 >/dev/null
find "$HOST_DIR" -name '0000000*' -mmin +360 -delete 2>/dev/null || true
docker exec "$CONTAINER" sh -c "find $SRC -name '0000000*' -mmin +360 -delete" 2>/dev/null || true
