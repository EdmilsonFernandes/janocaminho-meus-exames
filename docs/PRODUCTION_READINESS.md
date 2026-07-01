# Production Readiness — 10 Days to Launch

## Phase 1: CRITICAL (Days 1-3) — Crash prevention + Security

### Frontend
| # | Item | Status |
|---|------|--------|
| F1 | Error Boundary (blank screen prevention) | 🔨 |
| F2 | localStorage JSON.parse com try/catch | 🔨 |
| F3 | localStorage safe wrapper (private browsing) | 🔨 |
| F4 | Race condition cleanup no boot useEffect | TODO |
| F5 | Polling timeout no ExamShow (EXTRACTING > 60s) | DONE |

### Backend
| # | Item | Status |
|---|------|--------|
| B1 | Rate limiting (auth/AI/upload) | 🔨 |
| B2 | Transação no débito de créditos ($transaction) | DONE |
| B3 | CORS whitelist (não origin: true) | DONE |
| B4 | Error handler global (sem leak interno) | DONE |
| B5 | Zod validation nos endpoints críticos | TODO |

## Phase 2: HIGH (Days 4-6) — Reliability + UX

| # | Item | Area |
|---|------|------|
| H1 | Sentry (error tracking) | Backend + Frontend |
| H2 | Offline tolerance (retry + network indicator) | Frontend |
| H3 | Loading skeletons (Dashboard, Evolution, etc.) | Frontend |
| H4 | Health check robusto (/api/health com DB+S3+AI) | Backend |
| H5 | Code splitting (React.lazy nas rotas) | Frontend |
| H6 | Graceful shutdown (SIGTERM → drain) | Backend |
| H7 | Audit log básico (LGPD — quem acessou o quê) | Backend |

## Phase 3: MARKET (Days 7-10) — Diferencial + Polish

| # | Item | Impacto |
|---|------|---------|
| M1 | Sistema de indicação (referral = créditos) | Viral |
| M2 | Gamificação básica (badges + streak no Dashboard) | Retenção |
| M3 | Empty states premium (ilustrações + CTAs) | UX |
| M4 | Testes E2E do fluxo crítico (upload → extrair → análise → share) | Qualidade |
| M5 | Landing page otimizada (SEO + performance) | Aquisição |

## Regra: TODO fix novo vem com teste + regressão
- Backend: `npm test --workspace packages/server` deve passar (91+ testes).
- Frontend: `npm test --workspace packages/web` deve passar (9+ testes).
- typecheck web + server verdes antes de commit.
- AAB só na hora de publicar (bump versionCode).
