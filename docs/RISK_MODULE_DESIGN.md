# Módulo de Classificação de Risco — Análise Técnica & Implementação Segura

**App:** Dr. Exame / Minha Saúde · **Dataset:** `health_markers_dataset.csv` (Diagnostic Pathology Test Results)
**Data:** 2026-07-01 · **Código:** [`../risk-ml/`](../risk-ml/)

---

## Sumário executivo (TL;DR)

1. **O dataset é sintético / baseado em regras.** Provei: reconstruí os rótulos só com limiares
   clínicos e obtive **100,0000% de acurácia** (matriz de confusão perfeitamente diagonal). Os
   limiares aparecem cirurgicamente nos dados (Diabetes inicia exatamente em glicose 120 / HbA1c 6.5;
   Hipertensão em 130/90; Colesterol em LDL 141 / HDL 39 / Trig 180; Anemia em Hb ≤11 / VCM ≤79).
2. **A acurácia de ~100% é uma armadilha.** Árvore de profundidade 6 resolve 100% com variância
   **zero** entre folds em 25k amostras → o rótulo é função determinística das features → **não
   generaliza** para dados clínicos reais (sobreposição de limiares, comorbidades, faixas de pré-doença).
   O baseline honesto é **72%** (sempre prever "Fit").
3. **O dataset é clinicamente falho em "Fit".** ~40% dos "Fit" são, na verdade, **pré-diabetes**
   (5.202/18.000 com HbA1c 5.7–6.4; 7.100/18.000 com glicemia 100–119). E **zero comorbidades**
   (nenhum diabético é hipertenso) — irreal.
4. **Recomendação arquitetural:** a **camada de regras configurável é a primária** (explicável,
   auditável, clinicamente fundamentada); o **ML é 2ª opinião**, nunca a fonte única. O código em
   `risk-ml/` implementa exatamente isso e **corrige** os limiares sintéticos para diretrizes reais
   (ADA/SBC/SBI/OMS) + adiciona a faixa de **pré-diabetes** que o dataset não tem.
5. **Implementação no sistema (FEITA):** a camada de regras foi **portada para TypeScript dentro de
   `packages/server`** (sem microserviço Python, ML off por enquanto — ver §6). Endpoints `POST /api/risk/assess`
   e `GET /api/risk/latest` estão no ar, com modelo `RiskAssessment` no Prisma, migration aplicada e
   testes (unit + integração) passando.

> Este documento responde, na ordem, às 10 tarefas solicitadas.

---

## Tarefa 1 — Análise do dataset

**Caminho analisado:** `C:/Users/esantos/Downloads/health_markers_dataset.csv`

### Estrutura
- **Registros:** 25.000 × **10 colunas** (9 biomarcadores + alvo `Condition`).
- **Tipos:** todos os 9 biomarcadores são `float64`; `Condition` é `str` categórica.
- **Colunas:** `Blood_glucose, HbA1C, Systolic_BP, Diastolic_BP, LDL, HDL, Triglycerides, Haemoglobin, MCV, Condition`.

### Valores ausentes
- **162 ausentes por coluna** (~0,65%), **1.426 linhas** com ≥1 ausente; distribuição aleatória
  por célula (1.395 com 1 ausente, 30 com 2, 1 com 3) → **MCAR** (Missing Completely At Random).
- Proporção de ausentes por classe acompanha o tamanho da classe → **imputação mediana é segura** (não introduz viés). Sem linhas totalmente vazias; **0 duplicatas**.

### Balanceamento — **desbalanceado**
| Classe | n | % |
|---|---:|---:|
| Fit | 18.000 | 72,00 |
| Diabetes | 3.052 | 12,21 |
| Hypertension | 1.757 | 7,03 |
| High_Cholesterol | 1.323 | 5,29 |
| Anemia | 868 | 3,47 |

→ Acurácia bruta é enganosa (prever sempre "Fit" já dá 72%). Usei **split estratificado + `class_weight='balanced'`** e reporto **macro-F1**.

### Sintético vs. real — **PROVADO sintético/baseado-em-regras**

Reconstruí o rótulo aplicando só limiares (sem aprender nada):
```
Diabetes          se Blood_glucose ≥120 OU HbA1C ≥6.5
Hypertension      se Systolic_BP  ≥130 OU Diastolic_BP ≥90
High_Cholesterol  se LDL ≥141     OU HDL ≤39  OU Triglycerides ≥180
Anemia            se Haemoglobin ≤11 OU MCV ≤79
senão             Fit
```
**Acurácia = 100,0000%** sobre 23.574 linhas completas, **matriz de confusão perfeitamente diagonal**.
Sinais adicionais de síntese:
- **Zero comorbidades**: nenhuma linha dispara ≥2 regras (`nrules` ∈ {0,1}). Cada doença mantém os
  outros biomarcadores dentro da faixa normal — artificial.
- **"Fit" errado**: 5.202/18.000 com HbA1c 5.7–6.4 e 7.100/18.000 com glicemia 100–119 são
  **pré-diabetes** (ADA), rotulados como saudáveis.
- Valores parecem Gaussianos com ruído dentro de cada faixa gerada pela regra.

**Conclusão:** dataset útil como *sandbox/protótipo* e para validar o **pipeline** de regras, mas
**inadequado para validar performance clínica real**. Toda métrica reportada abaixo é "neste dataset".

---

## Tarefa 2 — Avaliação de riscos & política de linguagem

### Limites do dataset (declarar ao usuário / time)
1. **Não é dado clínico real** → métricas infladas; não autorizar decisão clínica automatizada.
2. **Rótulo único** → paciente com diabetes+hipertensão+colesterol não é representável (implementei detecção **multi-condição** nas regras para corrigir isto).
3. **"Fit" inclui pré-diabetes** → minha camada de regras reintroduz a classe `prediabetes`.
4. **Sem metadados** (idade, sexo, medicação, jejum confirmado, etiologia) → anemia/Hb são
   sexo-dependentes; trato como faixa conservadora até o upstream informar sexo.
5. **9 marcadores só** → não cobre TSH, creatinina, ferritina, etc. (o app já extrai estes).

### Política de linguagem (aplicada em `src/schema.py`)
- **Sempre** "possível", "pode indicar", "faixa associada a", "risco".
- **Nunca** "você tem diabetes", "você está anêmico", "diagnóstico".
- Todo resultado inclui `medicalDisclaimer` fixo: *"Esta análise é apenas educativa e não substitui
  avaliação médica. Nenhum resultado aqui constitui diagnóstico."*
- Recomendação de acompanhamento médico em toda explicação.
- Rótulo exibido via `condition_label()`: "Possível risco de diabetes", "Sem alterações relevantes", etc.

---

## Tarefa 3 — MVP: camada de regras clínicas configurável

**Coração do módulo.** Implementado em [`src/rules_engine.py`](../risk-ml/src/rules_engine.py) lendo
[`config/clinical_rules.yaml`](../risk-ml/config/clinical_rules.yaml) — **não há limiares hardcoded
no código**. Um clínico edita o YAML sem tocar Python.

- **Bandas por marcador** com `severity` (info/low/moderate/high), `condition`, `finding` (texto PT),
  `min/max` inclusivos. 1 finding por marcador (bandas excludentes).
- **Risk policy** combinável: `riskLevel = max(severity)`; **escalonamento multi-sistema**
  (≥2 condições com severity≥moderate → `high`).
- **Limiares corrigidos** para diretrizes reais (ex.: glicemia ≥126, HbA1c ≥6.5, PAS ≥130/PAD ≥90) e
  **faixa de pré-diabetes adicionada** (glicemia 100–125 / HbA1c 5.7–6.4) — o dataset a rotulava "Fit".
- **Auditável**: cada `Finding` carrega a `band` exata que o gerou.

Resultado de exemplo (caso diabético):
```
riskLevel: high | primary: diabetes | confidence: alta | markers: 9
  [high] diabetes  Glicemia de jejum elevada (≥126 mg/dL)...
  [high] diabetes  HbA1c elevada (≥6,5%)...
```

---

## Tarefa 4 — Modelo de Machine Learning

Pipeline em [`src/train.py`](../risk-ml/src/train.py): load → split estratificado 80/20 →
`SimpleImputer(median)` → `StandardScaler` (só p/ LR) → treino → métricas → CV 5-fold → salva joblib.

### Resultados (neste dataset)
| Modelo | Accuracy | Macro-F1 |
|---|---:|---:|
| **Dummy (sempre "Fit") — baseline** | 0,7200 | 0,167 |
| DecisionTree (profundidade 6) | 1,0000 | 1,000 |
| LogisticRegression | 0,9998 | 0,9996 |
| **RandomForest** | 1,0000 | 1,000 |
| RandomForest — CV 5-fold | — | **1,0000 ± 0,0000** |

### Por que isso é uma armadilha (ler antes de qualquer deploy)
- Uma **árvore de profundidade 6** com 100% e **variância zero** entre folds = o rótulo é
  determinístico. Árvore é, literalmente, uma cascata de limiares — ela apenas re-descobriu as regras
  geradoras. Em dados reais (sobreposição, ruído, comorbidade) a performance cairá drasticamente.
- **Feature importance** do RF é ~uniforme (~0,12 em cada), o que é mais um sintoma de dado sintético
  balanceado por regra, não de sinal clínico aprendido.
- **Implicações:** (a) nunca reportar "97–100% de acurácia" sem o baseline de 72%; (b) o modelo
  **não pode** ser a decisão primária; (c) antes de produção é obrigatório re-treinar/validar em dados
  reais (anonimizados) e **calibrar** (Platt/isotônico) — `predict_proba` aqui é 1.0 pela superconfiança.

### Artefatos
- `models/rf_pipeline.joblib` (pipeline RF + imputer, pronto p/ inferência).
- `models/model_meta.joblib` (features, classes, métricas, aviso `note` de não-generalização).
- Inferência: [`src/infer.py`](../risk-ml/src/infer.py) → `{predictedCondition, confidence, margin,
  reliable, probabilities}`. `reliable=True` só se `margin≥0.20` **e** ≥5 features presentes.

---

## Tarefa 5 — Resposta estruturada da IA

Contrato em [`src/schema.py`](../risk-ml/src/schema.py) + montagem em
[`src/risk_service.py`](../risk-ml/src/risk_service.py). Exemplo real (diabetes) em
[`examples/example_diabetes.json`](../risk-ml/examples/example_diabetes.json):

```json
{
  "predictedCondition": "Possível risco de diabetes",
  "predictedConditionKey": "diabetes",
  "confidence": 0.87,
  "confidenceNote": "Confiança da análise combinada (regras + modelo), não do modelo isolado.",
  "riskLevel": "high",
  "basis": "rules",
  "mlAgreesWithRules": true,
  "detectedFindings": [
    "Glicemia de jejum elevada (≥126 mg/dL) — faixa associada a risco metabólico aumentado",
    "HbA1c elevada (≥6,5%) — associada a risco metabólico aumentado"
  ],
  "findings": [ { "name_pt": "...", "marker": "...", "value": 168, "unit": "mg/dL",
                  "severity": "high", "condition": "diabetes", "finding": "..." } ],
  "userExplanation": "Atenção de intensidade importante: há alterações em glicose e/ou HbA1c que podem indicar risco metabólico aumentado. Os exames que mais influenciaram esta análise foram: Glicemia de jejum, Hemoglobina glicada (HbA1c). Recomendamos levar estes resultados ao seu médico para confirmação e conduta. Esta análise não substitui uma consulta médica.",
  "doctorQuestions": [
    "Esses valores indicam risco de diabetes?",
    "Preciso repetir o exame em jejum?",
    "Devo investigar resistência à insulina?"
  ],
  "medicalDisclaimer": "Esta análise é apenas educativa e não substitui avaliação médica. Nenhum resultado aqui constitui diagnóstico."
}
```

**`confidence` é da fusão** (regras+ML), não o número ~1.0 do modelo isolado — evita transmitir a
superconfianência sintética ao usuário.

---

## Tarefa 6 — Integração com o fluxo do app

> **DECISÃO:** em vez de um microserviço Python (mais um container no EC2), a camada de regras foi
> **portada para TypeScript dentro de `packages/server`**. Raciocínio: as regras são a camada primária
> (segura/auditável) e o ML atual é não-generalizável (dado sintético) → não justifica um serviço a
> mais em produção agora. O ML Python liga depois, como 2ª opinião, quando houver dados reais.

### Fluxo ponta-a-ponta (IMPLEMENTADO no Node)
```
PDF/imagem do exame
  → pdftotext -layout  (packages/server/src/extraction/pipeline.ts)
  → GLM extrai itens {name, value, unit, refLow/High, flag}
  → normalize.canonicalName()  (packages/server/src/utils/normalize.ts)
  → persistência em ExamItem  +  health-state.computeMarkerState()   (Layer 1)
  ─────────── Layer 3 NOVA (packages/server/src/analysis/risk-*) ───────────
  → risk-service.buildRiskAssessment(patientId)
       ├─ buildMarkerState() (lab)  +  última Measurement BLOOD_PRESSURE (sistólica/diastólica)
       ├─ risk-engine.assessRisk(markers)   [regras configuráveis -> findings/riskLevel/explicação]
       └─ persiste RiskAssessment (cache 24h)
  → (opcional, futuro) GLM reescreve userExplanation — IA só redige, não diagnostica
  → histórico -> tendência de risco vs RiskAssessment anteriores
  → UI mostra cartão de risco (Tarefa "telas" — pendente)
```

### Arquivos implementados no servidor
| Arquivo | Papel |
|---|---|
| `packages/server/src/analysis/risk-rules.ts` | **Config tipada** das regras (bandas, severidade, narrativas, perguntas) — chaves canônicas do `normalize.ts`. Editável por clínico. |
| `packages/server/src/analysis/risk-engine.ts` | `assessRisk()` **pura** (sem DB): findings + riskLevel + explicação + perguntas. Testável. |
| `packages/server/src/analysis/risk-service.ts` | Orquestra: `buildMarkerState` + última PA → engine → persiste `RiskAssessment` (cache 24h). |
| `packages/server/src/routes/risk.routes.ts` | `POST /api/risk/assess`, `GET /api/risk/latest` (auth + `userPatientIds`). |
| `packages/server/prisma/schema.prisma` | modelo `RiskAssessment` + relations Patient/Exam. |
| `packages/server/prisma/migrations/20260701000000_add_risk_assessment/` | migration SQL (aplica no boot via `migrate deploy`). |
| `packages/server/test/risk-engine.test.ts` | 9 checks unitários da engine. |
| `packages/server/test/risk.routes.test.ts` | 7 checks de integração (E2E da rota). |

### Por que o encaixe é limpo (símbolos reais do servidor)
O app **já produz tudo** que este módulo consome — não houve reescrita de extração/normalização:
- `health-state.ts` → `MarkerState` (`nameCanonical`, `latest.valueNumeric`, `unit`, `trend`...). As
  chaves canônicas (GLICEMIA, HEMOGLOBINA_GLICADA, LDL, HDL, TRIGLICERIDES, HEMOGLOBINA, VCM) **são
  exatamente** as chaves das regras em `risk-rules.ts` — alinhamento direto, sem camada de tradução.
- A pressão arterial vem de `Measurement` (`value`=sistólica, `valueSecondary`=diastólica, confirmado
  pelo front `Measurements.tsx`) → montada como `PRESSAO_SISTOLICA`/`PRESSAO_DIASTOLICA`.

**Papel conceitual:** o módulo de risco é uma nova **Layer 3 (condition-level)** que agrega o
`MarkerState` (Layer 1, por marcador) em **condições de risco**. Hoje a IA é instruída por prompt a
inferir o quadro; aqui o quadro vira **dado estruturado** (mesma filosofia do M1 keystone).

### Como usar a API
```bash
# Avaliar (computa + persiste, cache 24h):
curl -X POST $API/api/risk/assess -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"patientId":"<id>"}'
# force=true ignora cache e recomputa; examId vincula a um exame.

# Última avaliação (somente leitura):
curl "$API/api/risk/latest?patientId=<id>" -H "Authorization: Bearer $TOKEN"
```
Sem IA/créditos — a camada de regras é determinística e grátis (diferente de `/api/analyses`).

### Modelo de dados (Prisma — IMPLEMENTADO)
```prisma
model RiskAssessment {
  id              String   @id @default(cuid())
  patientId       String
  patient         Patient  @relation(...)
  examId          String?
  exam            Exam?    @relation(...)
  conditionKey    String   // none | prediabetes | diabetes | hypertension | high_cholesterol | cardiovascular_risk | anemia
  conditionLabel  String   // "Possível risco de diabetes" (PT, pronto p/ UI)
  riskLevel       String   // low | moderate | high
  confidence      Float
  ruleConfidence  String   // alta | baixa
  basis           String   @default("rules")   // rules (hoje) | ml_only (futuro)
  mlSuspect       Boolean  @default(false)
  findings        Json     // findings[] auditáveis
  doctorQuestions Json?
  userExplanation String?
  snapshot        Json     // input canônico (valores por marcador — auditoria/reprodutibilidade)
  createdAt       DateTime @default(now())
  @@index([patientId, createdAt])
  @@index([examId])
  @@map("risk_assessments")
}
```
Histórico permite **tendência de risco** ("seu risco metabólico caiu de high→moderate em 6m") —
consistente com o `CurrentHealthSummary` existente.

> Nota de migration: `prisma migrate dev` quebra num shadow DB por drift pré-existente
> (em `20260622140000_add_app_settings`). Por isso a migration foi escrita **manualmente** e marcada
> como aplicada no dev via `migrate resolve`. O `migrate deploy` (boot do container prod) **não** usa
> shadow DB, então a aplica normalmente.

---

## Tarefa 7 — Camada de normalização de exames

[`src/normalize.py`](../risk-ml/src/normalize.py) + [`config/marker_aliases.json`](../risk-ml/config/marker_aliases.json).

- **Nomes → canônico** (snake): strip de acentos + casefold + casamento por borda **longest-first**
  ("hemoglobina glicada" casa antes de "hemoglobina"). Anti-merge: `Hemoglobina A2/A2/HbF → None`
  (não colapsa em hemoglobina total), espelhando o servidor.
- **Unidades → padrão**: `mmol/L→mg/dL` (glicose ×18.02, LDL/HDL ×38.67, trig ×88.57),
  `g/L→g/dL` (Hb ×0.1), `IFCC→NGSP` p/ HbA1c.
- Mapeamento cobre exatamente os aliases solicitados: *Glicose/Glucose/Blood Glucose*,
  *Hemoglobina Glicada/HbA1C/A1C*, *Colesterol LDL/LDL*, *Colesterol HDL/HDL*,
  *Triglicerídeos/Triglycerides*, *Hemoglobina/Haemoglobin*, *VCM/MCV* (+ extras PAS/PAD).

Smoke test (todos corretos): `Glucose 7.0 mmol/L → blood_glucose 126.13`; `VCM 72 → mcv`;
`Hemoglobina A2 → None`.

---

## Tarefa 8 — Mensagens seguras para o usuário

Política centralizada em [`src/schema.py`](../risk-ml/src/schema.py):
- `build_explanation()` é **determinística por template** (auditável): cita intensidade, quais exames
  influenciaram, recomenda médico, anexa disclaimer.
- **Opcional** `build_glm_prompt()` para a IA generativa (GLM via relay já usado pelo app) **reescrever**
  a explicação de forma fluida — mas a IA recebe os findings **já decididos como fato** e está proibida
  de nomear novas condições, inventar valores ou fechar diagnóstico (espelha `health-summary.ts`:
  IA explica, dado decide). Texto GLM = refino, nunca fonte.
- `doctorQuestions` por condição em `clinical_rules.yaml` — perguntas objetivas para levar ao médico.

---

## Tarefa 9 — Entregáveis (checklist)

- [x] **Análise do dataset** — Tarefa 1 acima (estrutura, ausentes, balanceamento, inconsistências, sintético comprovado).
- [x] **Proposta de arquitetura** — regras primárias + ML 2ª opinião + integração Layer 3 sobre `MarkerState`.
- [x] **Código de treinamento** — [`risk-ml/src/train.py`](../risk-ml/src/train.py) (RF/LR/DT, métricas, CV, joblib).
- [x] **Código de inferência** — [`risk-ml/src/infer.py`](../risk-ml/src/infer.py) + orquestrador [`risk_service.py`](../risk-ml/src/risk_service.py).
- [x] **Estrutura JSON de resposta** — Tarefa 5 (+ [`examples/`](../risk-ml/examples/)).
- [x] **Exemplos por condição** — `example_{diabetes,anemia,hypertension,high_cholesterol,fit,prediabetes_mmol}.json`.
- [x] **Sugestões de tela** — seção abaixo.
- [x] **Segurança & privacidade** — seção abaixo (LGPD).
- [x] **Próximos passos** — seção abaixo.
- [x] **Testes** — [`risk-ml/tests/test_rules.py`](../risk-ml/tests/test_rules.py) (21 checks, `python tests/test_rules.py`).

### Exemplos de retorno por condição (resumo)
| Condição (input) | riskLevel | primary | basis | mlAgrees |
|---|---|---|---|---|
| Diabetes (glic 168 / HbA1c 8.1) | high | diabetes | rules | ✅ |
| Anemia (Hb 9.5 / VCM 68) | moderate | anemia | rules | ✅ |
| Hipertensão (152/98) | high | hypertension | rules | ✅ |
| Colesterol alto (LDL 190 / HDL 35 / Trig 260) | high | high_cholesterol | rules | ✅ |
| Saudável | low | none | rules | ✅ |
| **Pré-diabetes** (glicose 6.3 mmol/L→113 / HbA1c 5.9) | low | **prediabetes** | rules | ❌ (ML é cego p/ pré-diabetes) |

> O último caso é a demonstração mais forte do design: o **dataset** chamaria isso de "Fit"; as regras
> corretamente sinalizam **pré-diabetes**; e o ML (treinado sem essa classe) discorda — exatamente por
> isso ele é 2ª opinião, nunca a decisão.

---

## Sugestões de tela (UI)

O app já tem `CurrentStateCard` e visão médica. Propõe-se um **cartão "Leitura de risco"** opcional no
detalhe do exame / dashboard:

1. **Cabeçalho colorido por `riskLevel`** (verde/amarelo/vermelho) com `predictedCondition` + ícone.
   Sem o termo "diagnóstico". Ex.: 🟡 *Possível risco de colesterol alto*.
2. **"O que chamou atenção"** → lista `detectedFindings` (cada um com chip do marcador + severidade).
3. **Explicação** → `userExplanation` (texto GLM refino se habilitado) + `medicalDisclaimer` fixo no rodapé.
4. **"Perguntas para seu médico"** → `doctorQuestions` como checklist copiável.
5. **Confiança transversal** → pequena legenda: "Análise combinada de regras clínicas + modelo
   (confiança 0,87). Não substitui consulta." — **não** mostrar a probabilidade 1.0 do ML.
6. **Tendência** (quando há histórico) → seta ↑/↓ do `riskLevel` entre `RiskAssessment`s.
7. **CTA** → "Compartilhar com meu médico" (já existe área médica) / "Agendar conversa".

Acessibilidade: cores nunca sozinhas (sempre ícone + texto); `riskLevel` mapeado para
`aria-label`; respeitar o font-scale do Android (convenção do projeto: ellipsis no rodapé, wrap em chips).

---

## Tarefa 10 — Stack & segurança/privacidade (LGPD)

### Stack (alinhada ao monorepo existente)
- **Python (risk-ml):** pandas, scikit-learn, pyyaml, joblib, FastAPI. Serviço **interno** (`127.0.0.1:4051`
  ou dentro da docker network do EC2), **sem exposição pública**.
- **Backend Node (packages/server):** adapter chama `POST /assess`, persiste `RiskAssessment` (Prisma),
  usa o GLM (relay Z.ai já configurado) só para o texto. Mesmas regras do projeto: Prisma 6, Node 20,
  porta 4001, migrations via `prisma migrate deploy` (nunca `db push` em prod).
- **Frontend (web/mobile):** consome o novo campo de risco; sem lógica de diagnóstico no cliente.
- **IA generativa:** **apenas explicação textual**, nunca diagnóstico — coerente com a memória
  `extraction-text-not-vision` (GLM não enxerga PDF/imagem; extração é `pdftotext→texto→GLM`).

### Segurança & privacidade
- **PHI não sai do cluster:** o modelo ML roda **local** (joblib); apenas valores de exame (não o PDF)
  trafegam no `POST /assess`, sob `127.0.0.1`/rede interna. O disclaimer e a base legal (LGPD art. 11,
  saúde) devem constar no Termo de Uso e no consentimento do paciente.
- **Consentimento & finalidade:** classificação de risco educativa = dado sensível; exigir opt-in,
  registro em `auditLog` (já existe `packages/server/src/middleware/auditLog.ts`).
- **Minimização:** `RiskAssessment.snapshot` guarda só os valores canônicos necessários; o PDF original
  já tem ciclo de vida próprio de retenção.
- **Não decisão automatizada de saúde sem revisão humana:** o módulo **recomenda**, não decide.
  `mlSuspect` e `basis="ml_only"` ficam para **auditoria clínica**, não para alarmar o paciente.
- **Validação clínica pré-deploy:** limiares do `clinical_rules.yaml` devem ser **revisados por um
  médico** antes de ir a produção (preferencialmente em consulta ao CFM para conformidade de publicidade/telessaúde).
- **Reprodutibilidade:** modelo versionado (`model_meta.joblib`); re-treino só em dados reais
  anonimizados + calibração.

---

## Próximos passos (evolução do modelo)

1. **Dados reais (prioridade máxima):** coletar exames anonimizados (com consentimento) para
   re-treinar/validar. Até lá, **ML off ou só auditoria**; manter regras como primárias.
2. **Calibração de probabilidades** (Platt/isotônico) + threshold de `margin` ajustado em dados reais.
3. **Pré-diabetes como classe real** (o dataset não tem) — as regras já cobrem; o ML precisa de dados.
4. **Comorbidades:** hoje o ML é single-label; avaliar **multi-label** (OneVsRest) em dados reais.
5. **Sexo/idade como contexto:** Hb e LDL são sexo/idade-dependentes; receber do cadastro do paciente.
6. **Expansão de marcadores:** TSH, creatinina, ferritina, PCR, TGO/TGP (o app já extrai) → novas regras
   + novos alvos (ex.: risco renal, tireoidiano, hepático).
7. **Tendência de risco:** usar a série temporal de `RiskAssessment` (ex.: janela de 12m) como feature.
8. **Explicabilidade adicional:** SHAP no RF para mostrar, por paciente, o peso de cada marcador
   (reforço visual do `detectedFindings`).
9. **Monitoring:** drift de input, taxa de `mlSuspect`, auditoria periódica de casos `high`.
10. **Revisão clínica contínua** das bandas do YAML (comitê/CFM) a cada ciclo.

---

## Como reproduzir os números deste documento
```bash
cd risk-ml && pip install -r requirements.txt
python src/train.py --csv <caminho>/health_markers_dataset.csv   # métricas + modelo
python tests/test_rules.py                                        # 21 checks
python examples/generate_examples.py                              # 1 JSON por condição
```
