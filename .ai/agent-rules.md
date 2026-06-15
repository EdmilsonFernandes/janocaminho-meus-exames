# AGENT RULES — Meus Exames

Você é um agente técnico do projeto **Meus Exames** (gestão de exames médicos com IA).
O deploy é feito pelo próprio usuário (via git + docker compose no EC2).

## REGRA PRINCIPAL
A tarefa só está concluída quando:
1. Código alterado
2. Validado (`npx tsc --noEmit` em `packages/server` e `packages/web`; em mudanças de banco, migration aplicada localmente)
3. Commit + push feitos
4. Informar ao usuário: commit hash, escopo (server/web/mobile/db) e o que rodar

---

## AMBIENTE

### Local (Windows + Node 20)
```bash
npm run db:up        # sobe Postgres (porta 5433 no host — 5432 ocupado pelo janocaminho)
npm run db:migrate   # aplica migrations Prisma
npm run db:seed      # cria usuário/paciente iniciais
npm run dev          # servidor (:4001) + web (:5173)
```
Login padrão (do `packages/server/.env`): vem do `SEED_*`.

### Produção (EC2 — mesmo servidor do EdEspeto)
- Servidor: `ec2-3-137-119-152.us-east-2.compute.amazonaws.com`, usuário `ec2-user`
- Chave: `medtrack-system.pem` (`D:\PESSOAL\chamanoespeto-aws\`)
- App em `~/meus-exames` (a definir no clone)
- Stack isolada: `docker-compose.prod.yml` (Postgres próprio + app em `127.0.0.1:4010`)
- Deploy: `git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` (migrations rodam no startup)
- HTTPS: nginx do EC2 + certbot (ver `DEPLOY.md`)

SSH é permitido APENAS para investigação de erros (logs, `docker ps`, SQL). NÃO rodar deploy/git pull via SSH proativamente.

---

## ARQUITETURA

```
Celular (APK/Capacitor) / Navegador
    │
Nginx EC2 :443 (domínio do app) →  meus-exames-app (:4010 no host)
    │
Meus Exames App (Node/Express + Prisma + build estático do react-admin)
    ├── /api/*        → API (auth, exames, extração/IA, resumo, chat, lembretes)
    ├── /*            → SPA react-admin (estático)
    └── /api/files/*  → PDFs (em /app/data/exams)
    │
    ├── meus-exames-db (Postgres 16, próprio)
    └── IA: relay Z.ai (GLM) via ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL
```

Monorepo npm workspaces: `packages/server` (API), `packages/web` (react-admin), `packages/mobile` (Capacitor → APK/AAB), `packages/shared`, `packages/docs`.

---

## DECISÕES DE STACK (NÃO MUDAR SEM PENSAR — foram forçadas pelo ambiente)

- **Node 20** → Prisma **6** (não 7; o 7 removeu `url` do datasource e exige Node 22); Capacitor **7** (não 8; o 8 exige Node 22).
- **react-admin 5.14** *bundla o próprio MUI* → use **@mui/material ^7** (NÃO 9 — gera duas cópias e quebra tipos/runtime).
- **IA via RELAY (Z.ai/GLM), não Anthropic direto**: o dono não tem `ANTHROPIC_API_KEY` (sk-ant). Usa `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`.
  - ⚠️ O relay **NÃO suporta** `output_config.format` (structured output), `thinking` nem `effort` → a extração/resumo usam `client.messages.create()` pedindo **JSON no prompt** + `extractJsonObject` (`packages/server/src/utils/json.ts`). **Nunca** re-adicionar structured output/thinking/effort (quebra o relay). `hasAnthropicKey()` aceita `ANTHROPIC_API_KEY` **ou** `ANTHROPIC_AUTH_TOKEN`.
  - Extração por **VISÃO** (PDF como bloco `document`) — texto plano embaralha as tabelas dos exames. Cada item traz `page` (citação).
- **Portas**: backend **4001**, Postgres host **5433** localmente (o projeto **janocaminho** do mesmo dono ocupa 4000 e 5432 neste Docker). NUNCA mexer nos containers `janocaminho-*`.

---

## IA DE SAÚDE — LIMITE DE SEGURANÇA (LGPD/ANVISA)

- A IA **NÃO diagnostica**. Educa, compara com faixa de referência, contextualiza pelo perfil clínico (`Patient.clinicalProfile`) e lista **perguntas para o médico**.
- Há prompt explícito + pós-filtro (`diagnosticGuard`) reforçando o disclaimer.
- Dado de saúde é **sensível (LGPD)**: PII (CPF/RG) criptografada em coluna (`pgcrypto`, `APP_ENCRYPTION_KEY`); PDFs fora do banco. Single-user first; schema já suporta dependentes.

---

## PADRÃO DE MIGRATIONS (Prisma)

- Schema em `packages/server/prisma/schema.prisma`.
- Mudou schema? Edite o `schema.prisma` e rode `npm run db:migrate --workspace packages/server -- --name <nome>`.
- Em produção, `prisma migrate deploy` roda automático no startup do container.
- O servidor (tsx watch) **segura a DLL do Prisma** → sempre **parar o servidor** antes de `prisma generate`/migrate localmente, senão dá EPERM.

---

## BUILD / TESTES

- Typecheck: `cd packages/server && npx tsc --noEmit` e `cd packages/web && npx tsc --noEmit`.
- Build web: `npm run build --workspace packages/web` (gera `packages/web/dist`).
- Teste de extração isolado (precisa das creds da IA): `cd packages/server && npx tsx scripts/test-extraction.ts <pdf>`.

---

## APK / AAB (Capacitor)

- Mudou algo do front → rebuildar o app nativo:
  ```bash
  cd packages/mobile
  export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"   # Windows
  npm run sync                                       # builda web + copia p/ www + cap sync
  cd android && ./gradlew.bat assembleDebug          # APK  (app-debug.apk)
  # ou ./gradlew.bat bundleRelease                   # AAB (Play Store)
  ```
- Mudou código **nativo** (plugins, AndroidManifest, build.gradle) → bump `versionCode`+1 e `versionName`.
- O APK precisa apontar pra um backend acessível: em teste local, `VITE_API_URL=http://<IP-da-rede>:4001/api`; em produção, `VITE_API_URL=/api` (mesmo domínio). Sempre rebuildar após mudar o `VITE_API_URL`.

---

## REGAS CRÍTICAS

- NÃO rodar deploy/git pull no servidor via SSH proativamente.
- NÃO refatorar fora do pedido; NÃO alterar fora do escopo.
- NÃO esconder erro; NÃO dizer "concluído" sem validar (`tsc --noEmit` limpo).
- NÃO usar `ANTHROPIC_API_KEY` real — use o relay (`ANTHROPIC_AUTH_TOKEN`+`BASE_URL`).
- NÃO mexer nos containers `janocaminho-*`.
- SEMPRE informar commit + escopo + o que rodar.

---

## FORMATO DE RESPOSTA
- Objetivo:
- Escopo: server / web / mobile / db
- Arquivos alterados:
- Commit: `<hash>`
- Push: ✅
- Deploy necessário: `git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` (e reexecutar seed só se 1º deploy)
- Precisa `git pull` no servidor?: sim/não
