---
name: meus-exames-dev
description: Regras, convenções, gotchas e procedimentos do projeto Meus Exames (React-admin + Capacitor + Express + Prisma + GLM). Use ao tocar qualquer parte do código, buildar, deployar ou debugar.
---

# Meus Exames — Skill de Desenvolvimento

## Stack (NÃO MUDAR SEM PENSAR)
| Componente | Versão/Config | Por quê |
|---|---|---|
| Node | 20 | Lock do ambiente |
| Prisma | 6 (não 7) | Compatibilidade Node 20 |
| Capacitor | 7 (não 8) | core@8 quebra build; android@7 |
| react-admin | 5.14 | Bundles MUI próprio |
| @mui/material | ^7 (não 9) | Duplicate copy + type errors em 9 |
| Vite | 8 (rolldown) | `codeSplitting` (não `manualChunks`) |
| IA | GLM-4.6 via relay Z.ai | `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`. NUNCA `ANTHROPIC_API_KEY` real. Relay NÃO suporta `output_config`, `thinking`, `effort`. |
| Postgres | porta 5433 | janocaminho ocupa 5432 |
| Backend | porta 4001 | janocaminho ocupa 4000 |
| Extracao | pdftotext → texto → GLM | NUNCA visão (relay alucina em PDF/imagem) |

## Arquitetura (monorepo npm workspaces)
```
packages/
  server/   — Express 5 + Prisma 6 + PostgreSQL (API em /api)
  web/      — React 19 + react-admin 5 + MUI 7 + Vite 8 (SPA + Capacitor)
  mobile/   — Shell Capacitor 7 (embrulha web → APK/AAB)
  shared/   — Tipos compartilhados
```
- **API URL prod**: `https://janocaminho.com.br/minhasaude/api`
- **API URL dev**: `http://localhost:4001/api`
- **API URL APK**: URL absoluta (capacitor://localhost não alcança relativas)
- **Docker**: imagem única (`ghcr.io/edmilsonfernandes/meus-exames-app`) = server + web estático

## Deploy (automático)
```
git push origin main
  → publish-ghcr.yml (GitHub Actions):
      1. job `test`: vitest contra postgres efêmero (gate — falhou = não builda)
      2. job `build-and-push`: Docker build + push GHCR (com build-args + labels de versão)
  → deploy.yml (workflow_run):
      SSH EC2 → docker compose pull + up --force-recreate
      health-check curl /api/health
```
- **NÃO buildar na EC2** (t2.micro, pouca RAM). Só pull.
- **Concurrency**: push novo cancela build antigo (evita race no `:latest`).
- **Deploy só se publish success** (workflow_run.conclusion == 'success').

## Build APK/AAB (Capacitor)
```bash
cd packages/mobile
npm run sync          # build web (VITE_BASE './') + cap sync android
cd android
./gradlew bundleRelease   # AAB (Play Store)
./gradlew assembleDebug   # APK (sideload rápido p/ teste)
```
- **versionCode +1 SEMPRE** antes de AAB (Play Store rejeita duplicado). Editar `app/build.gradle`.
- **VITE_BASE './'** (relativa) — imune ao MSYS path-mangling (`/` → `/Program Files/Git/` no Windows). Diagnosticar: grep "Program Files" em www/index.html.
- **Push no APK**: precisa `google-services.json` + `VITE_PUSH_ENABLED=true`. Sem isso, `PushNotifications.register()` crasha o app nativo.
- **navigate(0)/location.reload()** CRASHA o APK (recarrega WebView). Usar `useRefresh()` do react-admin.
- **Offline-first**: `fetch-cache.ts` (em main.tsx) cacheia GET /api/ → serve cache quando offline.

## Validação OBRIGATÓRIA antes de commitar
| Tipo de mudança | Comando |
|---|---|
| Server (backend/rotas/schema) | `npx prisma generate && npx tsc --noEmit && npm test --workspace packages/server` |
| Web (frontend) | `npx tsc --noEmit` (vite build NÃO type-checka; CI pega e quebra deploy) |
| Schema | `prisma generate` + `DATABASE_URL=...test... prisma db push` + `npm test` |
| Mobile | `npm run sync` + testar no aparelho (APK debug) |

- **NUNCA** rodar `npx vitest` da raiz do repo (CWD vaza, pode truncar DB de dev). SEMPRE `npm test --workspace packages/server`.
- **DB de teste**: `meus_exames_test` (porta 5433). `test/setup.ts` seta `DATABASE_URL`. `prisma db push` sincroniza (NÃO `migrate dev` — migrations têm drift P3006).
- **Novo código = novos testes**: unit pra lógica pura, E2E (supertest) pra rotas, regressão pra bugs.

## Migrations — CUIDADO
- **Prod usa `prisma migrate deploy`** no boot do container (Dockerfile CMD).
- **Dev/Teste usa `prisma db push`** (direto schema→DB, sem migration files).
- **NUNCA misturar** `db push` em prod com `migrate deploy` → colunas duplicadas → P3009 → app cai (502).
- **Migrations aditivas** (ADD COLUMN): usar `IF NOT EXISTS` (idempotente — sobrevive a re-run/estado parcial).
- **Migration falhou em prod (P3009)**: `UPDATE _prisma_migrations SET finished_at=now() WHERE finished_at IS NULL;` (marca como aplicada) + restart container.

## SSH EC2 (Operações)
```bash
# Chave
cp projeto-pessoal/EdEspetoHub/medtrack-temp.pem /tmp/jano.pem && chmod 600 /tmp/jano.pem
ssh -i /tmp/jano.pem ec2-user@janocaminho.com.br

# Comandos úteis
docker logs meus-exames-app --tail 50 -f     # logs do app
docker exec janocaminho-postgres psql "$DBC" -c "..."  # query DB
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate  # restart
```
- **fail2ban ativo**: se "Connection reset", esperar e tentar de novo (não brute-force).
- **NUNCA tocar `janocaminho-*` containers** (rodam EdEspeto).
- **DB URL**: `grep DATABASE_URL .env.prod | sed 's/?.*//'` (tira o schema param pro psql).
- **Schema do DB**: `public` (tabela `users` NÃO `User` — minúsculas via @@map).
- **Backup**: `scripts/pg-backup.sh` → S3 bucket `jnc-db-backups-prod`.

## Gotchas Conhecidos
| Problema | Sintoma | Solução |
|---|---|---|
| **Push não chega** | FCM aceita mas device não exibe | Remover `channel_id: 'meus-exames'` do android config (canal inexistente → Android 8+ descarta) |
| **React #310 (hooks)** | Componente crasha ao carregar | Hook depois de early-return. Todos os hooks ANTES de qualquer `return`. |
| **APK tela branca** | WebView não carrega JS | `VITE_BASE './'` (não '/'). Grep "Program Files" em index.html. |
| **APK crash ao navegar** | `navigate(0)` ou `reload()` | Usar `useRefresh()` do react-admin (reload recarrega WebView = crash). |
| **Migration P3009** | Container restart loop, 502 | Marcar migration falhada como aplicada no `_prisma_migrations`. |
| **`@capacitor/core@8` warning** | cap sync avisa mismatch | Ignorar (cosmético). Runtime usa core@7.6.7 (web/node_modules). |
| **Google SSH (push reset)** | git push falha "Connection reset" | Retry (roteado por ssh.github.com:443 no ~/.ssh/config). |
| **consultacRM 100/mês** | Limite de buscas de CRM | Cacheia no banco (Doctor lookup persiste). Sem chave → manual. |
| **normalizeKey stripa acentos** | Regex não casa "MÉDICO" | Patterns SEM acento (MEDICO, ATENCAO, etc.). |

## Email (Zoho SMTP)
- Host: `smtp.zoho.com:587`, User: `contato@janocaminho.com.br`
- Secure: false (STARTTLS). From: `Meus Exames <contato@janocaminho.com.br>`
- Funciona end-to-end (DNS válido). Rejeição é do destinatário, não da config.

## Push (Firebase FCM)
- **Server**: `firebase-adminsdk.json` em `/app/keys/` (volume mount no EC2). Init lazy.
- **Client**: `google-services.json` em `packages/mobile/android/app/`. `VITE_PUSH_ENABLED=true`.
- **Projeto Firebase**: `janocaminho-minhasaude` (mesmo project_id no server key + client).
- **NÃO usar channel_id custom** → canal padrão do Capacitor (senão Android 8+ descarta).

## Monetização (parametrizada no banco)
- AppSetting key=`creditCosts`: chat=2, summary=10, consolidated=20, extraction=0
- AppSetting key=`grants`: freeSignup=60, monthly=300
- AppSetting key=`shares`: soma dos escopos (exams+evolution+alerts+summary)
- AppSetting key=`uploadRules`: freeCost, premiumFreeQuota, premiumCost
- Admin edita live (painel admin) → sobrevive a restart.

## Local Dev (Docker)
- App na porta 4011, login `edmilson@exemplo.com` / `troque123`
- `docker compose -f docker-compose.local.yml up`
- Rebuild + testar E2E ANTES de pushar.

## Convenções de Código
- **CRM normalizado**: chave `${numero}-${UF}` (ex.: `116739-SP`). `normalizeCrmKey()` em `doctor.routes.ts`.
- **OTP**: `issueOtp(email)` / `verifyOtp(email, code)` — persistido em arquivo (`data/agent/otp-store.json`).
- **Build-info**: `scripts/generate-build-info.mjs` carimba versão+commit em cada build (dev/build/Docker). Gerado (gitignored). `/api/health` expõe `{ build: { version, commit, ... } }`.
- **Code splitting**: páginas pesadas com `lazy()` (Chat, DoctorPortal, Landing, Plans, Reminders).
- **TypeScript**: interfaces pros modelos (types/). Evitar `any` (refatorar quando encontrar).

## Fluxo de Trabalho Recomendado
1. **Estudar** o código relevante (ler antes de editar).
2. **Implementar** com typecheck + testes locais.
3. **Validar**: `tsc --noEmit` + `npm test --workspace packages/server`.
4. **Commit** com mensagem descritiva (scope: subject).
5. **Push** → deploy automático.
6. **Verificar deploy**: `/api/health` (commit hash bate).
7. **AAB se necessário** (mobile): bump versionCode + sync + gradlew.
