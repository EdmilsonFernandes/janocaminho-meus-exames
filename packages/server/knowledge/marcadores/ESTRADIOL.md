# Estradiol (E2)

> Card de marcador (camada de referência curada — ver `.claude/skills/medical-research/SKILL.md`).
> Ainda NÃO mapeado em `analysis/knowledge.ts` (que serve condições); alvo futuro: enriquecer
> o prompt do `explain.ts` (camada `exam_knowledge`).

## O que é (leigo)
Hormônio sexual predominante feminino, presente também em homens (concentrações baixas).
Cerca de 95% circula ligado à SHBG no sangue.

## O que os valores significam
- **Elevado em homem (valor isolado)**: a primeira suspeita é ANALÍTICA, não clínica —
  imunoensaios quimiluminescentes diretos (método comum dos laboratórios) têm limitação
  conhecida em concentrações baixas, exatamente a faixa masculina. Confirmar por
  LC-MS/MS (espectrometria) antes de interpretar.
- Interpretar SEMPRE junto: testosterona total + SHBG (testosterona livre CALCULADA —
  ensaio direto de fração livre não é recomendado), função hepática, medicamentos
  (ex.: anabolizantes, espironolactona, antiandrógenos), contexto clínico.
- Em mulheres: fase do ciclo muda o valor (coleta preferencial em fase folicular inicial);
  estradiol não tem ritmo circadiano (testosterona sim — coleta matinal).

## Fatores que influenciam
Método do ensaio (o principal em homens) · SHBG alta/low · obesidade (aromatização) ·
doença hepática · medicamentos · álcool.

## Sinais de alerta (procure médico)
Elevação PERSISTENTE confirmada por método adequado, com ginecomastia dolorosa, perda
de libido ou infertilidade — avaliação endocrinológica.

## Perguntas úteis para o médico
- Esse resultado precisa de confirmação por método mais preciso (LC-MS/MS)?
- Vale avaliar testosterona total + SHBG (livre calculada)?
- Devo repetir o exame? Em que condições?
- Algum medicamento meu ou questão hepática pode explicar?

## Fontes
- SEQCML/SEEN/SEEP — *Recommendations for the measurement of sexual steroids in clinical
  practice* (position statement), 2023 — imunoensaios diretos limitados em concentrações
  baixas; espectrometria como referência (Endocrine Society/CDC HoSt); 95% do E2 ligado à
  SHBG; livre calculada via T total+SHBG+albumina (confiança: alta) — PMID 37359897 —
  consultado 2026-09-07
- *Gynecomastia: Etiological Analysis Beyond Hormonal Imbalance* (2026) — etiologia além
  do desbalanço hormonal; leitura relacionada por título (confiança: média) — PMID 42355536 —
  consultado 2026-09-07
