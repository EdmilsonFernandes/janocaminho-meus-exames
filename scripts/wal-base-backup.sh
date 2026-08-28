#!/usr/bin/env bash
set -euo pipefail
# Base backup FISICO (pg_basebackup) — obrigatorio pro PITR: WAL so replays sobre base fisica.
# Diario (cron 02:33); tar.gz -> S3; rotacao local KEEP_LATEST. /tmp do container = camada
# efemera (ok: sobe e apaga). Requer "local replication postgres trust" no pg_hba.conf.
CONTAINER="${POSTGRES_CONTAINER_NAME:-janocaminho-postgres}"
S3_BUCKET="${BACKUP_S3_BUCKET:-jnc-db-backups-prod-222984221398}"
S3_PREFIX="${BACKUP_S3_BASE_PREFIX:-wal/base-backups}"
KEEP_LATEST="${KEEP_LATEST:-1}"
OUT_DIR="${BACKUP_DIR:-$HOME/backups/meus-exames/wal-base}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"
docker exec "$CONTAINER" sh -c "rm -rf /tmp/wal-base && mkdir -p /tmp/wal-base"
docker exec "$CONTAINER" pg_basebackup -U postgres -D /tmp/wal-base -Fp -Xs 2>&1 | tail -1
docker exec "$CONTAINER" tar -czf /tmp/wal-base.tar.gz -C /tmp wal-base
docker cp "$CONTAINER:/tmp/wal-base.tar.gz" "$OUT_DIR/base-$TS.tar.gz" >/dev/null
docker exec "$CONTAINER" rm -rf /tmp/wal-base /tmp/wal-base.tar.gz
test -s "$OUT_DIR/base-$TS.tar.gz"
aws s3 cp "$OUT_DIR/base-$TS.tar.gz" "s3://${S3_BUCKET}/${S3_PREFIX}/base-$TS.tar.gz" --only-show-errors --sse AES256
ls -1t "$OUT_DIR"/base-*.tar.gz 2>/dev/null | tail -n +$((KEEP_LATEST+1)) | while IFS= read -r old; do rm -f -- "$old"; done
echo "base backup ok: base-$TS.tar.gz ($(du -h "$OUT_DIR/base-$TS.tar.gz" | cut -f1))"
