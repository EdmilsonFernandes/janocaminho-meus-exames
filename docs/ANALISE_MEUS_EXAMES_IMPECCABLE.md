# Análise UX/UI — "Meus Exames" (refinamento controlado · modo OPERATE)

Skill **impeccable**. Registro do documento A–J aprovado (2026-08-13) + decisões. Referência para os próximos estágios (S4–S6).

## Decisões (aprovadas)
- Escopo do 1º ciclo: **S0–S3** (só `/exams`). Detalhe (S4) e desktop master/detail (S5) num ciclo seguinte.
- Registro visual: **quieter-first** (calmo, médico, legível).
- Off-limits: só as 23 regras clínicas + cópia médica (nenhum acréscimo).

## Verdade travada (NÃO tocar — 23 regras clínicas server-side)
`computeFlag` · `reconcileScaleFlag` · `isAbnormal` (armazenado) · `priorityOf`/`priorityOfItem` · `refScaleSuspect` · `canonicalName`+SYNONYMS · `normalizeUnit`/`sanitizeUnitInText` · temporal (atual/recente/histórico/desatualizado) · `buildCurrentHealthSummary` (score) · `collapseAdjacentNearDupes` · `mergeLabsByDate` · `dedupeIntraDoc` · dedup por dia · buckets `/flag-summary` · `trendDirection` · scale-mismatch trend guard · `deltaPct` · regressão `/evolution` · PhenoAge · risco cardiometabólico · anti-alucinação IA · `pickReference` · identidade/anti-fraude.

## Heuristic score (0–10) — baseline pré-redesign
Clarity 5 · Hierarchy 4 · Scanability 5 · Cognitive load 5 · Trust 6 · Accessibility 6 · Responsiveness 5 · Consistency 4 · Visual craft 5 · Task efficiency 5 → **≈5,0/10**. Base sólida (primitivas + regras robustas); a entrada do `/exams` entregava menos do que o app sabia fazer.

## Top problemas (A)
1. `/exams` não respondia às 5 perguntas (último exame / mudou / atenção em 5s).
2. Vermelho dessensibilizava (categoria/admin, não prioridade clínica).
3. "O que mudou" existia no backend mas não chegava ao `/exams`.
4. Datas só absolutas e miúdas (sem relativo); `timeAgo` duplicado ×5.
5. Banner de atenção (detalhe) era lista plana sem faixa/comparação.
6. PDF sem "Abrir laudo" no header.
7. Desktop = mobile esticado, sem master/detail.
8. Baixa densidade / scroll informacional.
9. Card bypassava o design system (`hexFor`, `border-left:4px`, hex literais).
10. Filtros limitados (sem Alterados/Recentes).

## IA proposta (D)
`/exams` = painel de entrada da saúde laboratorial (progressive disclosure): Header+busca → filtros Todos/Alterados/Recentes → **Hero "último exame"** → **"Desde seu último exame"** (ChangesSinceExam) → histórico denso. Detalhe preserva tudo + "Abrir laudo" no header + banner via ExamMarker. Desktop: master/detail split (`?id=`).

## Component architecture (H)
- NOVOS mínimos: `DateLabel` (consolida timeAgo×5), `openExamFile` (web+APK), `ExamHero` (leve, sobre AppCard).
- REÚSO: `AppCard` (interactive/tinted+glow), `SeverityBadge`, `ValueBar`/`RefBar`/`UnitLabel`/`ExamMarker`, `ChangesSinceExam` (extraída), `GradientButton`, `PageHeader`, `EmptyState`, `RADIUS`/`LAYOUT`.
- REMOVIDO: `hexFor`/`statusColor`/`statusLabel` locais → `priorityOf`/`PRIORITY_META`/tokens de paleta.

## Plano incremental (J)
- **S0 — Primitivas:** ✅ DateLabel + timeAgo canônico + ChangesSinceExam extraída + openExamFile + remover hexFor.
- **S1 — Card denso:** ✅ AppCard sem border-left, datas DateLabel, "M alterados", status por tokens.
- **S2 — Hero + "o que mudou":** ✅ ExamHero (Ver análise + Abrir laudo) + ChangesSinceExam.
- **S3 — Filtros:** ✅ Todos/Alterados/Recentes.
- **S4 — Detalhe:** ⏳ "Abrir laudo" no header + banner via ExamMarker (faixa+delta).
- **S5 — Desktop master/detail:** ⏳ split `?id=`.
- **S6 — Polish:** ⏳ detect.mjs + a11y/contraste + rodada Playwright final.

## Validação S0–S3
`tsc --noEmit` web = 0 erros. Playwright (dados reais, 5 exames): mobile 390 + desktop 1366. Confirmado via DOM: hero, "Desde seu último exame" (3 pioraram), filtros, datas relativas (`09 jul 2026 · há 1 mês`), 0 cards com `border-left:4px`, filtro Alterados filtra corretamente, hero+changes em grid 2-col no desktop. Bug herdado corrigido: `piorouram`→`pioraram`.
