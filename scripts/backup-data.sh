#!/usr/bin/env bash
set -euo pipefail
# Backup dos ARQUIVOS do Meus Exames (PDFs, fotos, memoria .md) -> tar.gz -> S3.
# Roda no EC2 (cron). S3 via role da instancia.
APP_DIR="${APP_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
OUT_DIR="${BACKUP_DIR:-$HOME/backups/meus-exames}"
S3_BUCKET="${BACKUP_S3_BUCKET:-jnc-db-backups-prod-222984221398}"
S3_PREFIX="${BACKUP_S3_DATA_PREFIX:-data/meus-exames}"
S3_SSE="${BACKUP_S3_SSE:-AES256}"
KEEP_LATEST="${KEEP_LATEST:-1}"

mkdir -p "$OUT_DIR"
[ -d "$DATA_DIR" ] || { echo "Data dir nao encontrado: $DATA_DIR"; exit 1; }

ts="$(date -u +%Y%m%dT%H%M%SZ)"; out="$OUT_DIR/meus-exames-data_${ts}.tar.gz"
echo "Compactando $DATA_DIR -> $out"
tar -czf "$out" -C "$APP_DIR" data 2>/dev/null || tar -czf "$out" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
test -s "$out"

if [ -n "$S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
  echo "Enviando p/ s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$out")"
  aws s3 cp "$out" "s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$out")" --only-show-errors --sse "$S3_SSE"
  echo "S3 ok"
fi
echo "Backup de dados concluido: $out"
[ "$KEEP_LATEST" = "1" ] && ls -1t "$OUT_DIR"/meus-exames-data_*.tar.gz 2>/dev/null | tail -n +2 | while IFS= read -r o; do rm -f -- "$o"; done
