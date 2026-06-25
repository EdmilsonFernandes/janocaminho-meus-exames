# Meus Exames — Regras do Projeto

> **Guia completo**: `.ai/SKILL.md` (stack, deploy, gotchas, operações, arquitetura).

## Stack (NÃO MUDAR)
- **Node 20** + Prisma 6 (não 7) + Capacitor 7 (não 8) + react-admin 5.14 + MUI ^7 (não 9)
- **IA**: GLM-4.6 via relay Z.ai (`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`). NUNCA `ANTHROPIC_API_KEY` real. Relay NÃO suporta structured output / thinking / effort.
- **Extração**: pdftotext → texto → GLM. NUNCA visão (relay alucina em PDF).
- **Portas**: backend 4001, Postgres 5433 (janocaminho ocupa 4000/5432).

## Validação OBRIGATÓRIA antes de commitar
- **Server**: `cd packages/server && npx tsc --noEmit && npm test` (vitest + supertest).
- **Web**: `cd packages/web && npx tsc --noEmit` (vite build NÃO type-checka — CI pega e quebra deploy).
- **Schema**: `npx prisma generate` + `DATABASE_URL=...test... npx prisma db push` + `npm test`.
- **NUNCA** `npx vitest` da raiz (CWD vaza → pode truncar DB dev). Sempre `npm test --workspace packages/server`.

## Deploy (automático: git push → GHCR → EC2 pull)
- **CI gate**: vitest roda ANTES do build (falhou = não deploya).
- **Migrations**: `prisma migrate deploy` no boot do container. NUNCA `db push` em prod.
- **502 (migration P3009)**: `UPDATE _prisma_migrations SET finished_at=now() WHERE finished_at IS NULL;` + restart.

## APK/AAB
- **versionCode +1 SEMPRE** antes de AAB (`app/build.gradle`). Nunca reusar.
- **VITE_BASE './'** (relativa) — imune ao MSYS path-mangling no Windows.
- **navigate(0)/reload() CRASHA o APK** → usar `useRefresh()`.
- **Push**: `channel_id` NUNCA custom (Android 8+ descarta se canal não existe).
- Build: `cd packages/mobile && npm run sync && cd android && ./gradlew bundleRelease`.

## Top Gotchas
| Sintoma | Causa | Fix |
|---|---|---|
| Push não chega | `channel_id: 'meus-exames'` inexistente | Remover channel_id |
| React #310 | Hook depois de early-return | Todos hooks antes de return |
| APK tela branca | VITE_BASE '/' manglado pelo MSYS | VITE_BASE './' |
| Container restart loop | Migration P3009 (falhou) | Marcar aplicada + restart |
| `@capacitor/core@8` warning | Hoisting do monorepo | Ignorar (cosmético; runtime usa 7.6.7) |

## Convenções
- **CRM**: normalizado `${numero}-${UF}` (`normalizeCrmKey()` em `doctor.routes.ts`).
- **DB tabela**: `users` (minúscula via @@map). Schema DB: `public`.
- **DB URL p/ psql**: tira `?schema=public` (psql não aceita).
- **normalizeKey**: stripa acentos → regex patterns SEM acento (MEDICO, ATENCAO).
