# Contexto Integrado de Saúde — Análise Arquitetural Completa

> **Pergunta central:** "O que o Dr. Exame revela quando conecta exames laboratoriais ao que estava acontecendo no dia a dia da pessoa?"

---

## 1. Inventário dos dados atuais do Dr. Exame

### Exames laboratoriais (Extração → ExamItem)
| Dado | Origem | Storage | Granularidade |
|---|---|---|---|
| Valor do analito (valueNumeric + valueText) | PDF/foto → pdftotext → GLM | `ExamItem` | Por exame, por item |
| Faixa de referência (refLow/refHigh) | Laudo do laboratório | `ExamItem` | Por item |
| Flag (LOW/HIGH/NORMAL) | Sistema (comparação com faixa) | `ExamItem.isAbnormal` | Por item |
| Severidade (importante/moderada/leve) | `alertPriority.ts` (distância % da faixa) | Derivado | Por item |
| Categoria clínica (14 categorias) | `medicalData.ts` (regex por nome) | Derivado | Por item |
| Data do exame (performedAt) | Laudo ou OCR | `Exam.performedAt` | Por exame |

### Categorias com maior valor de cruzamento
| Categoria | Analitos-chave | Cruzamento com HC | Força |
|---|---|---|---|
| **Lipídios** | LDL, HDL, TG, colesterol total, não-HDL | Atividade, peso, exercício | ALTA |
| **Glicemia** | Glicose jejum, HbA1c, insulina, HOMA-IR | Atividade, peso, sono, glicemia contínua | ALTA |
| **Cardiovascular** | Pressão arterial (manual + HC) | FC repouso, exercício, peso | ALTA |
| **Renal** | Creatinina, eGFR, ureia | Hidratação, peso | MODERADA |
| **Inflamação** | PCR-us, VHS | Atividade regular, sono | MODERADA |
| **Hormônios** | TSH, T4, cortisol | Sono, FC repouso | MODERADA |
| **Hepática** | TGO, TGP, GGT | Peso (esteatose), álcool | MODERADA |

### Medições manuais + Health Connect
| Tipo | Fonte | Tabela | Já sincroniza? |
|---|---|---|---|
| Peso | Manual + HC | `Measurement[WEIGHT]` | Manual |
| Pressão arterial | Manual + HC | `Measurement[BLOOD_PRESSURE]` | Manual |
| Glicose capilar | Manual + HC | `Measurement[GLUCOSE]` | Manual |
| FC (manual) | Manual | `Measurement[HEART_RATE]` | Manual |
| **Passos** | HC only | `Measurement[STEPS]` | ✅ Auto |
| **Calorias** | HC only | `Measurement[CALORIES]` | ✅ Auto |
| **Distância** | HC only | `Measurement[DISTANCE]` | ✅ Auto |
| **FR avg/max** | HC only | Em memória (não persiste ainda) | ✅ Auto |

### Engine de tendências (já existe)
```typescript
// health-state.ts (Layer 2 — snapshot canônico)
interface CurrentHealthSummary {
  score: number | null;              // 0-100
  byPriority: { importante, moderada, leve };
  whatChanged: {
    nameCanonical: string;
    deltaPct: number | null;         // variação % entre exames
    trend: 'better' | 'worse' | 'stable' | 'first';
  }[];
  normalized: [...];                  // estava alterado, normalizou
  cardiometabolicRisk: {
    level: string;
    score: number;
    factors: { label: string; risk: boolean }[];
  };
}
```

### Análise de IA (health-summary.ts)
- Recebe ESTADO ATUAL + TENDÊNCIAS + CONTEXTO HISTÓRICO + PERFIL CLÍNICO
- Gera: score, pontos de atenção, coisas boas, metas, sugestões
- **Já recebe atividade física como contexto** (Onda 2 — commit ea8a207)

---

## 2. Inventário dos dados disponíveis pelo Health Connect

### Já lidos (implementado)
| Tipo | HC Record | Dado | Confiabilidade |
|---|---|---|---|
| Passos | `StepsRecord` | Contagem total/dia | Alta (celular/smartwatch) |
| Calorias | `TotalCaloriesBurnedRecord` | Estimativa kcal/dia | **BAIXA** (ver nota) |
| Distância | `DistanceRecord` | km/dia | Moderada (GPS/passos) |
| FR média | `HeartRateRecord` (samples) | bpm médio/dia | Alta (smartwatch) |
| FR máx | `HeartRateRecord` (samples) | bpm máx/dia | Alta (smartwatch) |
| Exercício | `ExerciseSessionRecord` | min/sessão | Alta (app registra) |

> ⚠️ **NOTA CALORIAS**: estimativas de gasto calórico variam 20-40% entre dispositivos. NUNCA usar como indicador clínico — apenas como "estimativa registrada pelo dispositivo".

### Disponíveis mas NÃO lidos ainda
| Tipo | HC Record | Valor clínico | Implementar? |
|---|---|---|---|
| **Peso** | `WeightRecord` | ALTO — cruza com lipídios/glicemia | ✅ Fase 1 |
| **Sono** | `SleepSessionRecord` | ALTO — sono <6h associado a disfunção metabólica | ✅ Fase 1 |
| **Pressão arterial** | `BloodPressureRecord` | ALTO — o Dr. Exame já mede manual | ✅ Fase 1 |
| **Saturação O₂** | `OxygenSaturationRecord` | MODERADO — contexto cardiopulmonar | Fase 2 |
| **Glicemia contínua** | `BloodGlucoseRecord` | ALTO se disponível (CGM) | Fase 2 |
| **FR em repouso** | Derivado de `HeartRateRecord` | ALTO — indicador de condicionamento | ✅ Fase 1 |
| **Frequência respiratória** | `RespiratoryRateRecord` | BAIXO para leigo | Não |
| **Composição corporal** | `BodyFatRecord`, etc | MODERADO | Fase 3 |
| **Hidratação** | `HydrationRecord` | MODERADO — cruza com função renal | Fase 2 |
| **Nutrição** | `NutritionRecord` | BAIXO (dados manuais pouco confiáveis) | Não |

---

## 3. Matriz de correlação: Exames × Health Connect

### CORRELAÇÕES COM EVIDÊNCIA FORTE (automatizável com confiança)

| Exame | Dado HC | Associação | Evidência | Confiança |
|---|---|---|---|---|
| **LDL, TG** | Atividade física (min/sem) | Exercício aeróbico 150+ min/sem associado a ↓LDL 5-10%, ↓TG 15-20% | AHA/ESC: metanálises RCT | ALTA |
| **HDL** | Atividade física | Exercício regular associado a ↑HDL 3-6% | AHA: revisão sistemática | ALTA |
| **HbA1c, glicose** | Atividade física | Exercício melhora sensibilidade insulínica; ↓HbA1c 0.6-0.8% com 150 min/sem | ADA: Standards of Care 2024 | ALTA |
| **Peso/IMC** | WeightRecord (HC) | Variação de peso é dado objetivo | Instrumento | ALTA |
| **TG, glicose** | Perda de peso ≥5% | Perda 5-10% do peso associada a ↓TG 20-30%, ↓glicose 10-15% | ADA/ESC/SBC | ALTA |
| **PA sistólica** | Atividade física regular | Exercício aeróbico associa a ↓PAS 5-8 mmHg | AHA/ESC/SBC | ALTA |
| **PA** | BloodPressureRecord (HC) | Comparação de tendências | Instrumento | ALTA |

### CORRELAÇÕES COM EVIDÊNCIA MODERADA (mostrar como educacional)

| Exame | Dado HC | Associação | Evidência | Confiança |
|---|---|---|---|---|
| **PCR-us** | Atividade regular | Sedentarismo associado a PCR elevada; exercício ↓PCR basal | Estudos observacionais | MODERADA |
| **TSH** | Sono regular | Distúrbios de sono associados a disfunção tireoidiana | Estudos coorte | MODERADA |
| **TGO/TGP/GGT** | Peso/perda peso | Esteatose hepática melhora com perda ≥7% peso | EASL/AASLD guidelines | MODERADA |
| **Creatinina/eGFR** | Hidratação | Desidratação pode elevar creatinina temporariamente | Fisiologia básica | MODERADA |
| **FC repouso** | Tendência temporal | ↓FC repouso com treino = melhor condicionamento | Fisiologia do exercício | MODERADA |
| **Glicemia/HbA1c** | Sono <6h/regular | Privação de sono piora controle glicêmico | Meta-análises | MODERADA |

### CORRELAÇÕES EXPLORATÓRIAS (só mostrar com padrão forte e disclaimer)

| Exame | Dado HC | Associação | Evidência | Confiança |
|---|---|---|---|---|
| HDL | Intensidade exercício | Maior intensidade pode ter efeito maior | Estudos pequenos | EXPLORATÓRIA |
| TG | Duração sono | Sono irregular associado a TG elevado | Observacionais | EXPLORATÓRIA |
| PCR | Sono | Privação associa a inflamação sistêmica | Observacionais | EXPLORATÓRIA |

### NÃO AUTOMATIZAR (não mostrar)

| Associação | Motivo |
|---|---|
| Calorias queimadas ↔ qualquer exame | Estimativa de dispositivo muito imprecisa |
| Passos ↔ biomarcador específico | Muitos confundidores (dieta, medicação, genética) |
| Qualquer afirmação causal | Sempre mostrar como associação temporal |

---

## 4. Arquitetura proposta

### Visão geral (NÃO colocar decisão clínica dentro de prompt de LLM)

```
┌─────────────────────────────────────────────────────┐
│                 HEALTH CONNECT                       │
│  (passos, peso, sono, PA, FR, exercício, etc)      │
└───────────────────────┬─────────────────────────────┘
                        │ sync (diário/idempotente)
                        ▼
┌─────────────────────────────────────────────────────┐
│           HealthConnectNormalizer                    │
│  • normaliza unidades                                │
│  • detecta fonte (smartwatch/celular/manual)         │
│  • avalia cobertura (# dias com dados)               │
│  • classifica qualidade: ALTA/MODERADA/BAIXA          │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│           HealthBaselineEngine                       │
│  • calcula baseline pessoal (30/60/90d)              │
│  • detecta mudanças sustentadas (não 1 dia)          │
│  • exige persistência ≥7 dias para validar           │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│           CorrelationEngine                          │
│  INPUT: baseline atividade + delta exames            │
│  RULES: matriz de correlação (acima)                 │
│  OUTPUT: {biomarker, hcMetric, direction, overlap,   │
│           evidenceLevel, confidenceLevel}            │
│  SÓ PRODUZ SE: janela temporal sobrepõe E            │
│  cobertura ≥70% E mudança ≥ threshold                │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│           EvidenceEngine                             │
│  • cada correlação tem: fonte, guideline, DOI        │
│  • classificação: ALTA/MODERADA/EXPLORATÓRIA         │
│  • regras NÃO MOSTRAR bloqueiam insights fracos      │
│  • deteta confounders (medicação, dieta, etc)        │
└───────────────────────┬─────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│           InsightPresenter (LLM = SÓ traduzir)       │
│  INPUT estruturado: {observation, context,           │
│    evidence, action, caveats, confidence}            │
│  LLM escreve em pt-BR compreensível                  │
│  JAMAIS inventa conclusão — só humaniza              │
└─────────────────────────────────────────────────────┘
```

### Novas tabelas (Prisma)

```prisma
// Baseline de atividade por janela temporal
model ActivityBaseline {
  id          String   @id @default(cuid())
  patientId   String
  patient     Patient  @relation(fields: [patientId], references: [id])
  // Janela (30d, 60d, 90d)
  windowDays  Int
  startDate   DateTime
  endDate     DateTime
  // Métricas
  avgSteps    Int
  avgKcal     Int      // estimativa — não usar como clínico
  avgKm       Float
  avgHrRest   Int?     // FR repouso (se disponível)
  avgExerciseMin Int  // min/semana de exercício formal
  avgSleepMin Int?    // se disponível
  avgWeightKg Float?  // se disponível
  avgSystolic Int?    // PA se disponível
  // Qualidade
  daysCovered Int      // dias com dados / dias da janela
  dataSource  String   // "Google Fit" | "Samsung Health" | "manual" | etc
  createdAt   DateTime @default(now())
  @@unique([patientId, windowDays, endDate])
  @@map("activity_baselines")
}

// Correlação detectada (saida do CorrelationEngine)
model HealthCorrelation {
  id            String   @id @default(cuid())
  patientId     String
  patient       Patient  @relation(fields: [patientId], references: [id])
  // Exame
  biomarker     String   // ex.: "LDL"
  examDateFrom  DateTime
  examDateTo    DateTime
  biomarkerDelta Float   // % de mudança
  biomarkerFrom  Float
  biomarkerTo    Float
  // Atividade
  hcMetric      String   // ex.: "exerciseMin" | "avgSteps" | "weightKg"
  baselineFrom  Float
  baselineTo    Float
  hcDelta       Float    // % de mudança
  windowDays    Int      // janela analisada
  // Classificação
  direction     String   // "both_improved" | "both_worsened" | "divergent"
  evidenceLevel String   // "HIGH" | "MODERATE" | "EXPLORATORY"
  confidenceScore Float  // 0-1 (cobertura × persistência × força)
  // Contexto
  confounders   String[] // ex.: ["medication_change", "diet"]
  createdAt     DateTime @default(now())
  @@index([patientId, biomarker, examDateTo])
  @@map("health_correlations")
}
```

---

## 5. UX por tela

### 5.1 Dashboard — Card "Desde seu último exame" ⭐ (assinatura do produto)

```
┌──────────────────────────────────────────────┐
│ 📊 Desde seu exame de abril                  │
│                                              │
│ 🏃 Atividade    +42%                         │
│ ⚖️ Peso         -4,6 kg                      │
│ ❤️ FC repouso   -5 bpm                       │
│ 🧪 LDL         142 → 119 (-16%)              │
│ 🧪 Triglic.     196 → 151 (-23%)             │
│                                              │
│ 3 hábitos e 2 exames evoluíram juntos.      │
│ [Entenda o que isso pode significar →]       │
└──────────────────────────────────────────────┘
```

**Só aparece quando:** ≥2 mudanças na mesma direção + cobertura ≥70% + evidência ≥ MODERADA

### 5.2 Relatório Completo — Nova seção

```
## Hábitos e sinais que ajudam a contextualizar seus exames

### Atividade física (30 dias)
Média atual: 7.420 passos/dia
Média anterior: 5.180 passos/dia
↑ 43%

### Perfil lipídico
LDL: 142 → 119 mg/dL (↓)

### Interpretação
O aumento de atividade física coincidiu com melhora no LDL.
Atividade física regular é um dos fatores associados à melhora
do perfil cardiovascular. Entretanto, alimentação, peso,
medicamentos e outros fatores também podem influenciar.

⚠️ Associação temporal observada — não estabelece causalidade.
```

### 5.3 Evolução — Camada de atividade

Sobreposição visual: barras de atividade atrás do gráfico de analitos. O usuário vê os dois juntos.

### 5.4 Linha do Tempo — Eventos comportamentais

```
12 MAR  🏃 Começou aumento consistente de atividade
28 ABR  ⚖️ Peso -5%
15 MAI  🧪 Novo exame (LDL ↓, TG ↓)
12 JUN  ❤️ FC repouso apresentou redução sustentada
```

### 5.5 Portal do Médico — Contexto de consulta

```
Desde o último exame (4 meses):
  Peso: -4,8 kg
  Atividade: +37% (7.200 → 9.900 passos/dia)
  FC repouso: 74 → 67 bpm
  LDL: 148 → 121 mg/dL
  Triglicerídeos: 196 → 151 mg/dL
  Sono: 6h02 → 6h48 (médio)

  ⚕️ Dados de dispositivo pessoal, fornecidos pelo paciente.
```

### 5.6 "O que pode ter contribuído?" (tap no exame alterado)

```
TRIGLICERÍDEOS: 198 → 142 (↓ 28%)

Mudanças no mesmo período:
  ↑ Atividade física +38%
  ↓ Peso -5,3%
  ↑ Sono médio +41 min/noite

"Estas mudanças ocorreram no mesmo período e são fatores
associados à saúde metabólica. Não é possível determinar,
apenas com estes dados, quanto cada fator contribuiu."
```

---

## 6. Regras de segurança clínica (EvidenceEngine)

### Thresholds mínimos para mostrar

| Critério | Mínimo |
|---|---|
| Cobertura de dados HC | ≥70% dos dias da janela |
| Persistência da mudança | ≥7 dias consecutivos |
| Magnitude da mudança HC | ≥10% (atividade) / ≥2kg (peso) / ≥3bpm (FC) |
| Magnitude da mudança exame | Fora da faixa → dentro, ou ≥15% delta |
| Sobreposição temporal | Janelas devem se sobrepor ≥50% |
| Nível de evidência | ≥MODERADA (nunca EXPLORATÓRIA sozinha) |

### Classificação de confiança

| Nível | Critério | Comportamento |
|---|---|---|
| **ALTA** | Guideline + cobertura >85% + ≥2 mudanças | Mostra com interpretação |
| **MODERADA** | Estudo coorte + cobertura >70% | Mostra com disclaimer estendido |
| **EXPLORATÓRIA** | Observacional + padrão forte | Só mostra ≥3 mudanças convergentes |
| **NÃO MOSTRAR** | Evidência fraca OU cobertura <70% | Bloqueado |

### Anti-patterns (bloqueados por design)

```typescript
// BLOQUEADO: afirmar causalidade
"Nossos dados mostram que a atividade física causou a queda do LDL."

// CORRETO: associação temporal
"O aumento de atividade coincidiu com a melhora no perfil lipídico."

// BLOQUEADO: número clínico exato de calorias
"Você queimou exatamente 832 kcal."

// CORRETO: estimativa
"Estimativa de gasto energético registrada pelo dispositivo: ~830 kcal."
```

---

## 7. Plano de implementação por fases

### FASE 1 — Fundação (2 semanas)
- [ ] Tabela `ActivityBaseline` + cálculo diário (cron)
- [ ] Sync expandido: peso, sono, PA, FR repouso do HC
- [ ] `HealthConnectNormalizer` (fonte, qualidade, cobertura)
- [ ] `HealthBaselineEngine` (baseline 30/60/90d)
- [ ] Card "Desde seu último exame" no Dashboard

### FASE 2 — Correlação (3 semanas)
- [ ] Tabela `HealthCorrelation`
- [ ] `CorrelationEngine` (matriz de regras acima)
- [ ] `EvidenceEngine` (classificação + gating)
- [ ] Seção "Hábitos e sinais" no Relatório Completo
- [ ] "O que pode ter contribuído?" (tap em exame alterado)
- [ ] Camada de atividade na Evolução

### FASE 3 — Portal + Timeline (2 semanas)
- [ ] Tile "Desde o último exame" no Portal do Médico
- [ ] Eventos comportamentais na Linha do Tempo
- [ ] Alertas inteligentes (baseline + persistência + contexto)

### FASE 4 — Inteligência (contínua)
- [ ] Prompt da IA recebe correlações estruturadas (nunca decide)
- [ ] Sistema 4-camadas: Observação → Contexto → Evidência → Próxima ação
- [ ] Detecção de padrões contrários ("tudo piorou junto")
- [ ] Calibração de thresholds com feedback real

---

## 8. Fontes científicas (por regra)

| Regra | Fonte |
|---|---|
| Exercício ↔ lipídios | AHA "Physical Activity and Exercise Recommendations" (2023) |
| Exercício ↔ HbA1c | ADA "Standards of Care in Diabetes" (2024, Section 5) |
| Exercício ↔ PA | ESC "Guidelines for the management of elevated blood pressure" (2023) |
| Peso ↔ metabolismo | ADA + SBC "Obesity Guideline" (2023) |
| Sono ↔ glicemia | Meta-análise Sleep Medicine Reviews (2023) |
| FR repouso ↔ condicionamento | European Journal of Preventive Cardiology (2022) |
| Perda peso ↔ esteatose | EASL "NAFLD Guidelines" (2023) |

---

## 9. Vantagem competitiva

| App | Lê exames | Lê atividade | Correlaciona | Longitudinal | IA explicativa |
|---|---|---|---|---|---|
| Google Fit | ❌ | ✅ | ❌ | ❌ | ❌ |
| Samsung Health | ❌ | ✅ | ❌ | ❌ | ❌ |
| CalcLab | ✅ | ❌ | ❌ | ❌ | ❌ |
| BloodGPT | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Dr. Exame** | ✅ | ✅ | **✅** | **✅** | **✅** |

**O diferencial é a camada de correlação contextual com segurança clínica.** Ninguém no mercado brasileiro faz isso.

---

## 10. Estratégia para dados faltantes e conflitantes

### Dados faltantes
- HC sem dados de peso → card mostra só o que tem (nunca inventa)
- HC sem sono → seção "sono" não aparece
- Cobertura <70% → insight bloqueado (não mostra com dados incompletos)

### Dados conflitantes
- PA manual ≠ PA do HC → mostra AMBOS com fonte e data
- Peso manual ≠ peso HC → usa o mais recente com fonte identificada
- Valores impossíveis (ex.: HR 300bpm) → descarta e registra

---

## 11. LGPD e consentimento

| Aspecto | Implementação |
|---|---|
| Consentimento granular | Por tipo de dado (passos, peso, sono — cada um separado) |
| Revogação | Perfil → Acessibilidade → desconecta (remove sync, mantém histórico) |
| Transparência | Cada insight mostra: fonte do dado, janela, cobertura |
| Minimização | Só lê o que vai usar; não lê localização, contatos, etc |
| Retenção | Dados de atividade retidos enquanto paciente ativo |
| Portabilidade | Export CSV de atividade + correlações |
