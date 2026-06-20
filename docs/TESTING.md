# Regra de Testes — Meus Exames (OBRIGATÓRIO p/ o agente IA)

> **NUNCA mande código quebrado pra produção.** Toda mudança passa por teste antes do push.

## 1. Quando rodar o quê
| O que mudou | Rodar |
|---|---|
| **Rota/endpoint backend** (qualquer `packages/server/src/routes/*`) | `npm test --workspace packages/server` |
| **Lógica backend** (utils, jobs, auth) | `npm test --workspace packages/server` |
| **Frontend** (qualquer `packages/web/src/*`) | `npm run typecheck --workspace packages/web` (+ rebuild APK se for mobile) |
| **Backend + frontend** | **os dois** |
| **Schema (prisma)** | `prisma generate` + `db push` no DB de teste + `npm test --workspace packages/server` |

**Tudo verde → pode commit + push.** Se algo falhar → corrige ANTES de pushar. Nunca pushar com teste vermelho.

## 2. Comando de teste (SÓ este)
```bash
npm test --workspace packages/server
```
⚠️ **NUNCA** `npx vitest` da raiz do repo (já limpou o DB de DEV uma vez — CWD vazava). O `npm test --workspace` seta o DB de teste corretamente.

## 3. DB de teste
- `meus_exames_test` (porta 5433). `test/setup.ts` seta `DATABASE_URL`.
- Se mexeu no schema: `cd packages/server && DATABASE_URL=...meus_exames_test... npx prisma db push` ANTES dos testes.
- `resetDb` (helpers) recusa DB que não seja de teste (guard).

## 4. Toda NOVA funcionalidade → testes
- **Lógica nova** (função pura, cálculo) → **teste unitário** (`src/utils/*.test.ts`).
- **Rota/fluxo novo** (endpoint, auth flow) → **teste E2E** (`test/*.test.ts`, supertest).
- **Bug corrigido** → adicione um teste que **reproduz o bug** (regression).

## 5. Padrões
- Unitários em `src/utils/*.test.ts` (funções puras, sem DB).
- E2E em `test/*.test.ts` (supertest + DB de teste; helpers: `api()`, `createUser()`, `resetDb`, `mintToken`, `authHeader`).
- Mocks globais em `test/setup.ts` (mailer, storage, IA, chat — zero chamada externa).

## 6. Exemplo: adicionar um endpoint
1. Cria a rota em `src/routes/*.ts`.
2. Adiciona teste E2E em `test/<area>.test.ts`.
3. `npm test --workspace packages/server` → verde.
4. Commit + push.

## 7. Tipos de teste atuais (referência)
- `test/auth.test.ts` — register/login/forgot/reset/OTP (E2E completo).
- `test/exams.test.ts`, `items.test.ts`, `patients.test.ts`, `billing.test.ts`, `credits.test.ts`, `chat-router.test.ts`.
- `src/utils/*.test.ts` — normalize, computeFlag, parseNumeric, computeUploadCost, compareVersions.
