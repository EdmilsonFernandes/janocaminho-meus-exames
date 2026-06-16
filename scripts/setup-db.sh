#!/usr/bin/env sh
# Cria o banco e a role do Meus Exames no Postgres EXISTENTE do Já no Caminho.
# Roda 1x no EC2. Não afeta o banco do EdEspeto (espetinho) — é um DB isolado.
# Uso:  DB_PASSWORD='senhaforte' sh scripts/setup-db.sh
set -eu

PG_CONTAINER="${PG_CONTAINER:-janocaminho-postgres}"
DB_NAME="${DB_NAME:-meus_exames}"
DB_USER="${DB_USER:-meus_exames}"
DB_PASSWORD="${DB_PASSWORD:-MUDAR_SENHA_FORTE_AQUI}"

if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "MUDAR_SENHA_FORTE_AQUI" ]; then
  echo "❌ Defina DB_PASSWORD (ex.: DB_PASSWORD='x' sh $0)" >&2; exit 1
fi

echo "📦 Criando role/db '${DB_NAME}' no container '${PG_CONTAINER}'..."
docker exec -i "$PG_CONTAINER" psql -U postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

docker exec -i "$PG_CONTAINER" psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 \
  || docker exec -i "$PG_CONTAINER" psql -U postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

echo "✅ Banco '${DB_NAME}' pronto (owner: ${DB_USER})."
echo "   Coloque no .env.prod:"
echo "   DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@host.docker.internal:5432/${DB_NAME}?schema=public"
