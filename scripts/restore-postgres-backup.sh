#!/usr/bin/env bash
set -euo pipefail
# Restaura um backup .sql.gz do meus_exames (do S3 ou local) num banco do janocaminho-postgres.
# Uso: restore-postgres-backup.sh <backup.sql.gz> [banco_destino]
# Restaurar no meus_exames (PROD) exige ALLOW_PRODUCTION_RESTORE=true + BACKEND_STOPPED_ACK=true.

BACKUP_FILE="${1:-}"
TARGET_DB="${2:-meus_exames_drill}"
CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-janocaminho-postgres}"
USER_NAME="${PGUSER:-postgres}"

[ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ] || { echo "Uso: $0 <backup.sql.gz> [banco_destino]"; exit 1; }
printf '%s' "$TARGET_DB" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || { echo "Banco invalido: $TARGET_DB"; exit 1; }
case "$TARGET_DB" in
  postgres|template0|template1) echo "Banco reservado: $TARGET_DB"; exit 1 ;;
  meus_exames)
    [ "${ALLOW_PRODUCTION_RESTORE:-false}" = "true" ] || { echo "Restaurar em meus_exames exige ALLOW_PRODUCTION_RESTORE=true"; exit 1; }
    docker ps --format '{{.Names}}' | grep -Fxq meus-exames-app && [ "${BACKEND_STOPPED_ACK:-false}" != "true" ] && { echo "Pare o meus-exames-app antes e set BACKEND_STOPPED_ACK=true"; exit 1; }
    ;;
esac

gzip -t "$BACKUP_FILE"
[ -f "$BACKUP_FILE.sha256" ] && ( cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE.sha256")" ) || true
docker exec "$CONTAINER_NAME" pg_isready -U "$USER_NAME" >/dev/null

echo "Recriando $TARGET_DB em $CONTAINER_NAME"
docker exec "$CONTAINER_NAME" psql -U "$USER_NAME" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid();" >/dev/null
docker exec "$CONTAINER_NAME" dropdb -U "$USER_NAME" --if-exists "$TARGET_DB"
docker exec "$CONTAINER_NAME" createdb -U "$USER_NAME" -O "$USER_NAME" "$TARGET_DB"

echo "Restaurando $BACKUP_FILE -> $TARGET_DB"
gzip -dc "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$USER_NAME" -d "$TARGET_DB" -v ON_ERROR_STOP=1 >/dev/null

docker exec "$CONTAINER_NAME" psql -U "$USER_NAME" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -c "
SELECT 'users' AS ent, COUNT(*) FROM users
UNION ALL SELECT 'patients', COUNT(*) FROM patients
UNION ALL SELECT 'exams', COUNT(*) FROM exams
UNION ALL SELECT 'exam_items', COUNT(*) FROM exam_items
UNION ALL SELECT 'ai_analyses', COUNT(*) FROM ai_analyses
ORDER BY ent;"
echo "Restore concluido: $TARGET_DB"
