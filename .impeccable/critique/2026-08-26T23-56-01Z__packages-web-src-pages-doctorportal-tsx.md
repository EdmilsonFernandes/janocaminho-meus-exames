---
target: DoctorPortal
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-26T23-56-01Z
slug: packages-web-src-pages-doctorportal-tsx
---
# Critique — Portal do Médico (Operate) · 2026-08-26
Method: dual-agent (A · B isolados)

Scores: 3,3,3,2,2,3,3,2,2,2 = 25/40 (Acceptable→Good)
SPECIFICITY: ALTA — estratificação por severidade, gating por escopo, modo cobre tipográfico.
DETECTOR: 1 finding (indicador width L1391) = FP.

PRIORITY ISSUES:
- [P1] detailLoading nunca lido → tiles '0 alterações' verde durante load/erro → harden
- [P1] catch(() => setExams([])) — erro vira 'nenhum exame' → harden
- [P2] Tiles Perguntas/Anotações sem aba ativa → layout
- [P2] Busca não cobre analito (TSH/ferritina) → shape
- [P2] Severidade achatada no hero (tile crítico mesmo peso) → bolder

PERSONAS: Sam — aria-label do Tab sobrescreve contador; Riley — acordeão vaza entre pacientes; Alex — fetch duplo /exams, sem ⌘K.
MINOR: heading duplicado; 3 acentos (teal/cobre/indigo); chips mobile sem affordance de scroll.
QUESTIONS: médico busca analito ou data/lab? tiles sticky? só último ano aberto?
