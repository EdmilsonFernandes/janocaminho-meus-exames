#!/usr/bin/env sh
# Deploy do Meus Exames (puxadinho no mesmo EC2/domínio do Já no Caminho).
# Uso:  SUBPATH=meus-exames sh scripts/deploy.sh
# Roda NO EC2. Requer: docker, .env.prod, e o banco já criado (scripts/setup-db.sh).
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod}"
SUBPATH="${SUBPATH:-minhasaude}"               # escolhido: minhasaude (outros: meus-exames, dr-exame...)
HOST="${HOST:-janocaminho.com.br}"
APP_PORT="${APP_PORT:-4010}"                     # porta local do container (nginx aponta pra cá)

# Deriva as vars do sub-caminho (build + servidor)
export VITE_BASE="/${SUBPATH}/"
export VITE_API_URL="/${SUBPATH}/api"
export WEB_BASE_PATH="/${SUBPATH}"
export WEB_ORIGIN="${WEB_ORIGIN:-https://${HOST}}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Falta $ENV_FILE. Copie de .env.prod.example e preencha." >&2
  exit 1
fi

# Detecta docker compose (com fallback sudo, como no EdEspeto)
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then COMPOSE="docker-compose"
elif command -v sudo >/dev/null 2>&1 && sudo docker compose version >/dev/null 2>&1; then COMPOSE="sudo -E docker compose"
else echo "❌ docker compose indisponível." >&2; exit 1; fi

echo "🚀 Meus Exames — deploy em https://${HOST}/${SUBPATH}/"
if command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "   revisão atual: $(git -C "$ROOT_DIR" rev-parse --short HEAD)"
  echo "   git fetch + reset (determinístico, imune a raça de fetch)..."
  git -C "$ROOT_DIR" fetch origin --prune 2>/dev/null && git -C "$ROOT_DIR" reset --hard origin/main 2>/dev/null || echo "   (git sync pulou — sem remote?)"
fi

echo "🔨 build + up (migrations rodam no startup do container)..."
$COMPOSE -f "$ROOT_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" up -d --build --force-recreate

echo "⏳ aguardando saúde (até 60s)..."
i=0
while [ "$i" -lt 30 ]; do
  if curl -sf "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo "   ✅ app saudável"; break
  fi
  i=$((i+1)); sleep 2
done
if ! curl -sf "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
  echo "   ⚠️  saúde não respondeu — veja: $COMPOSE -f docker-compose.prod.yml logs --tail 50" >&2
fi

echo "✅ Deploy concluído → https://${HOST}/${SUBPATH}/"
echo "   (lembrete: o nginx do EC2 precisa ter a location /${SUBPATH}/ apontando pra 127.0.0.1:${APP_PORT})"
