# Sobe o app (imagem de produção do GHCR) na porta 4011 contra o Postgres dev —
# ambiente ESTÁVEL para os E2E da jornada (sem vite/tsx-watch/HMR da sessão de dev).
# Uso: powershell -File e2e/up-local-docker.ps1   (derruba com: docker rm -f meus-exames-e2e)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)   # packages/web
$repo = Resolve-Path '../..'

docker rm -f meus-exames-e2e 2>$null | Out-Null
docker run -d --name meus-exames-e2e `
  -p 4011:4001 `
  --add-host=host.docker.internal:host-gateway `
  --env-file "$repo/packages/server/.env" `
  -e NODE_ENV=production `
  -e DATABASE_URL='postgresql://meus_exames:meus_exames_dev@host.docker.internal:5433/meus_exames?schema=public' `
  -e UPLOAD_DIR=/app/data/exams -e PHOTOS_DIR=/app/data/photos -e AGENT_DIR=/app/data/agent `
  -v "${repo}/data/exams:/app/data/exams" -v "${repo}/data/photos:/app/data/photos" -v "${repo}/data/agent:/app/data/agent" `
  ghcr.io/edmilsonfernandes/meus-exames-app:latest | Out-Null

Write-Output 'container up, aguardando health...'
$ok = $false
foreach ($i in 1..30) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4011/api/health' -TimeoutSec 3 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}
Write-Output "health ok: $ok"
if (-not $ok) { docker logs meus-exames-e2e --tail 30; exit 1 }
