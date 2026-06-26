# Arquitetura — Meus Exames

Sistema inteligente de gerenciamento de exames médicos com IA (GLM-4.6 via relay Z.ai).
Fonte de verdade detalhada de ops: `.ai/SKILL.md`.

## Stack (NÃO MUDAR SEM PENSAR — forçada pelo ambiente)
| Componente | Versão/Config | Por quê |
|---|---|---|
| Node | 20 | Lock do ambiente |
| Prisma | 6 (não 7) | Compatibilidade Node 20 (7 exige Node 22) |
| Capacitor | 7 (não 8) | core@8 quebra build; exige Node 22 |
| react-admin | 5.14 | Bundles MUI próprio |
| @mui/material | ^7 (não 9) | Duplicate copy + type errors em 9 |
| Vite | 8 (rolldown) | `codeSplitting` (não `manualChunks`) |
| IA | GLM-4.6 via relay Z.ai | `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`. **NUNCA** `ANTHROPIC_API_KEY` real. Relay **não suporta** structured output / thinking / effort. |
| Extração | **pdftotext → texto → GLM** | **NUNCA visão** (relay alucina em PDF/imagem). |
| Postgres | porta 5433 | janocaminho ocupa 5432 |
| Backend | porta 4001 | janocaminho ocupa 4000 |

## Monorepo (npm workspaces)
```
packages/
  server/   — Express 5 + Prisma 6 + PostgreSQL (API em /api)
  web/      — React 19 + react-admin 5 + MUI 7 + Vite 8 (SPA + Capacitor)
  mobile/   — Shell Capacitor 7 (embrulha o web → APK/AAB)
  shared/   — Tipos compartilhados
```

## Topologia de produção (EC2)
```
Celular (APK/Capacitor) / Navegador
    │
Nginx EC2 :443 (janocaminho.com.br/minhasaude)
    │
meus-exames-app (Node/Express + Prisma + build estático react-admin)
    ├── /api/*        → API (auth, exames, extração/IA, resumo, chat, lembretes, billing, admin)
    ├── /*            → SPA react-admin (estático)
    └── /api/files/*  → PDFs (em /app/data/exams, FORA do banco)
    │
    ├── meus-exames-db (Postgres 16 próprio, porta 5433)
    └── IA: relay Z.ai (GLM) via ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL
```
- **API URL prod:** `https://janocaminho.com.br/minhasaude/api`
- **API URL dev:** `http://localhost:4001/api`
- **API URL APK:** URL absoluta (capacitor://localhost não alcança relativas)
- **Docker:** imagem única `ghcr.io/edmilsonfernandes/meus-exames-app` (server + web estático).
- **NUNCA tocar** nos containers `janocaminho-*` (rodam EdEspeto).

## Deploy (automático: git push → CI → EC2)
```
git push origin main
  → publish-ghcr.yml:  job test (vitest contra postgres efêmero = GATE) → build-and-push (Docker→GHCR)
  → deploy.yml (workflow_run): SSH EC2 → docker compose pull + up --force-recreate → health-check /api/health
```
- Não buildar na EC2 (t2.micro, pouca RAM). Só pull.
- Deploy só roda se o `publish` terminou success.

## Migrations — CUIDADO
- **Prod:** `prisma migrate deploy` no boot do container (Dockerfile CMD).
- **Dev/Teste:** `prisma db push` (schema→DB direto). NUNCA misturar → colunas duplicadas → P3009 → 502.
- Migrations **aditivas** com `IF NOT EXISTS` (idempotentes).
- P3009 em prod: `UPDATE _prisma_migrations SET finished_at=now() WHERE finished_at IS NULL;` + restart.

## IA de Saúde — limite de segurança (LGPD/ANVISA)
- A IA **NÃO diagnostica**. Educa, compara com faixa de referência, contextualiza pelo perfil clínico, lista perguntas para o médico.
- Prompt explícito + pós-filtro `diagnosticGuard` reforçam o disclaimer.
- PII (CPF/RG) criptografada (`pgcrypto`, `APP_ENCRYPTION_KEY`); PDFs fora do banco.

## Decisões de stack (por que estas versões)
Detalhado em `.ai/SKILL.md` → "Stack" e em `.ai/agent-rules.md` → "DECISÕES DE STACK" (⚠️ agent-rules está **stale** sobre extração: o correto é pdftotext→texto→GLM, **não** visão).
