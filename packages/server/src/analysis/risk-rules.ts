/**
 * risk-rules.ts — Configuração TIPIADA das regras clínicas (camada PRIMÁRIA de risco).
 *
 * É o equivalente TS do `risk-ml/config/clinical_rules.yaml`, usando as MESMAS chaves
 * canônicas já produzidas pelo servidor (`packages/server/src/utils/normalize.ts`:
 * GLICEMIA, HEMOGLOBINA_GLICADA, LDL, HDL, TRIGLICERIDES, HEMOGLOBINA, VCM) + a pressão
 * arterial, que vem de `Measurement` (PRESSAO_SISTOLICA / PRESSAO_DIASTOLICA).
 *
 * Centralizada (NÃO espalhada no código): um clínico ajusta bandas/thresholds aqui.
 * Versão de produção da camada de regras — o ML Python fica como 2ª opinião futura.
 *
 * SEGURANÇA: faixas EDUCATIVAS (ADA/SBC/SBI/OMS). NÃO é diagnóstico. As mensagens
 * (finding) já vêm em linguagem de "possível/risco/faixa associada a".
 *
 * CORREÇÕES sobre o dataset sintético:
 *  - limiares ajustados p/ diretrizes reais (glicemia ≥126, HbA1c ≥6.5, PAS ≥130/PAD ≥90);
 *  - faixa de PRÉ-DIABETES adicionada (o dataset a rotulava como "Fit");
 *  - multi-condição (comorbidades) suportada (o dataset não tinha).
 *
 * OBS hemoglobina: faixas sexo-dependentes. Sem sexo, uso faixa feminina (mais sensível,
 * não perde anemia em homens). Sexo-aware = V1.1 (Patient.gender já existe).
 */

export type Severity = 'info' | 'low' | 'moderate' | 'high';
export type RiskCondition =
  | 'none' | 'prediabetes' | 'diabetes' | 'hypertension'
  | 'high_cholesterol' | 'cardiovascular_risk' | 'anemia'
  | 'renal' | 'obesidade' | 'insulinica';

export interface RiskBand {
  min?: number;        // inclusivo
  max?: number;        // inclusivo
  severity: Exclude<Severity, 'info'>;
  condition: Exclude<RiskCondition, 'none'>;
  finding: string;     // texto PT mostrado ao usuário
}

export interface MarkerRule {
  key: string;         // chave canônica do server (ex.: 'GLICEMIA')
  namePt: string;
  unit: string;        // unidade padrão esperada
  bands: RiskBand[];   // default (feminina ou neutra). 1ª que casa => finding (excludentes).
  bandsMale?: RiskBand[]; // masculinas quando Patient.gender === 'male'. Sem ele => usa `bands`.
  source?: string;     // citação/diretriz (M4: "por quê?" no card). Ex.: 'OMS/WHO anemia'.
}

export interface RiskRules {
  version: string;
  markers: MarkerRule[];
  riskPolicy: {
    severityRank: Record<Severity, number>;
    multiSystemEscalation: {
      whenDistinctConditionsGte: number;
      atSeverityGte: Exclude<Severity, 'info'>;
      becomes: Exclude<Severity, 'info'>;
    };
    minMarkersForConfidence: number;
  };
  doctorQuestions: Partial<Record<Exclude<RiskCondition, 'none'>, string[]>>;
  narratives: Partial<Record<Exclude<RiskCondition, 'none'>, string>>;
  conditionLabel: Record<RiskCondition, string>;
}

export const RISK_RULES: RiskRules = {
  version: '1.0.0-ts',
  markers: [
    {
      key: 'GLICEMIA', namePt: 'Glicemia de jejum', unit: 'mg/dL',
      source: 'ADA 2024 — Standards of Medical Care in Diabetes (glicemia de jejum)',
      bands: [
        { min: 100, max: 125, severity: 'low', condition: 'prediabetes',
          finding: 'Glicemia de jejum na faixa de pré-diabetes (100–125 mg/dL) — pode indicar alteração glicêmica inicial' },
        { min: 126, severity: 'high', condition: 'diabetes',
          finding: 'Glicemia de jejum elevada (≥126 mg/dL) — faixa associada a risco metabólico aumentado' },
      ],
    },
    {
      key: 'HEMOGLOBINA_GLICADA', namePt: 'Hemoglobina glicada (HbA1c)', unit: '%',
      source: 'ADA 2024 — Standards of Medical Care (HbA1c)',
      bands: [
        { min: 5.7, max: 6.4, severity: 'low', condition: 'prediabetes',
          finding: 'HbA1c na faixa de pré-diabetes (5,7–6,4%) — controle glicêmico no limite' },
        { min: 6.5, severity: 'high', condition: 'diabetes',
          finding: 'HbA1c elevada (≥6,5%) — associada a risco metabólico aumentado' },
      ],
    },
    {
      key: 'PRESSAO_SISTOLICA', namePt: 'Pressão sistólica (PAS)', unit: 'mmHg',
      source: 'SBC 2020 — Diretriz de Hipertensão Arterial / ACC-AHA 2017',
      bands: [
        { min: 120, max: 129, severity: 'low', condition: 'hypertension',
          finding: 'Pressão sistólica elevada (120–129) — faixa de pré-hipertensão' },
        { min: 130, max: 139, severity: 'moderate', condition: 'hypertension',
          finding: 'Pressão sistólica na faixa de hipertensão estágio 1 (130–139)' },
        { min: 140, severity: 'high', condition: 'hypertension',
          finding: 'Pressão sistólica elevada (≥140) — faixa de hipertensão estágio 2' },
      ],
    },
    {
      key: 'PRESSAO_DIASTOLICA', namePt: 'Pressão diastólica (PAD)', unit: 'mmHg',
      source: 'SBC 2020 — Diretriz de Hipertensão Arterial / ACC-AHA 2017',
      bands: [
        { min: 80, max: 89, severity: 'moderate', condition: 'hypertension',
          finding: 'Pressão diastólica na faixa de hipertensão estágio 1 (80–89)' },
        { min: 90, severity: 'high', condition: 'hypertension',
          finding: 'Pressão diastólica elevada (≥90) — faixa de hipertensão' },
      ],
    },
    {
      key: 'LDL', namePt: 'Colesterol LDL', unit: 'mg/dL',
      source: 'SBC/SBI 2021 — Atualização da Diretriz de Dislipidemias',
      bands: [
        { min: 130, max: 159, severity: 'low', condition: 'high_cholesterol',
          finding: 'LDL limítrofe alto (130–159) — pode indicar risco cardiovascular' },
        { min: 160, severity: 'moderate', condition: 'high_cholesterol',
          finding: 'LDL elevado (≥160) — associado a risco cardiovascular aumentado' },
      ],
    },
    {
      key: 'HDL', namePt: 'Colesterol HDL', unit: 'mg/dL',
      source: 'SBC/SBI 2021 — Diretriz de Dislipidemias (HDL como fator de risco)',
      bands: [
        { max: 39, severity: 'moderate', condition: 'cardiovascular_risk',
          finding: 'HDL baixo (<40) — fator de risco cardiovascular' },
      ],
    },
    {
      key: 'TRIGLICERIDES', namePt: 'Triglicerídeos', unit: 'mg/dL',
      source: 'SBC/SBI 2021 — Diretriz de Dislipidemias',
      bands: [
        { min: 150, max: 199, severity: 'low', condition: 'high_cholesterol',
          finding: 'Triglicerídeos limítrofe alto (150–199) — pode indicar risco metabólico' },
        { min: 200, max: 499, severity: 'moderate', condition: 'high_cholesterol',
          finding: 'Triglicerídeos elevado (200–499) — associado a risco metabólico' },
        { min: 500, severity: 'high', condition: 'high_cholesterol',
          finding: 'Triglicerídeos muito elevado (≥500) — atenção, procure médico com urgência' },
      ],
    },
    {
      // Sexo-aware (M1/V1.1): bands = feminina (OMS: anemia Hb<12); bandsMale = masculina (OMS: Hb<13).
      // Sem sexo => usa `bands` (feminina, mais sensível: não perde anemia em homens).
      key: 'HEMOGLOBINA', namePt: 'Hemoglobina', unit: 'g/dL',
      source: 'OMS/WHO — anemia (Hb g/dL): homem <13; mulher <12; gravidez <11',
      bands: [
        { min: 11, max: 11.9, severity: 'low', condition: 'anemia',
          finding: 'Hemoglobina abaixo do esperado (11,0–11,9) — possível alteração sugestiva de anemia leve' },
        { min: 8, max: 10.9, severity: 'moderate', condition: 'anemia',
          finding: 'Hemoglobina baixa (8,0–10,9) — possível anemia moderada' },
        { max: 7.9, severity: 'high', condition: 'anemia',
          finding: 'Hemoglobina muito baixa (<8,0) — procure avaliação médica' },
      ],
      bandsMale: [
        { min: 11, max: 12.9, severity: 'low', condition: 'anemia',
          finding: 'Hemoglobina abaixo do esperado para homem (11,0–12,9) — possível alteração sugestiva de anemia leve' },
        { min: 8, max: 10.9, severity: 'moderate', condition: 'anemia',
          finding: 'Hemoglobina baixa (8,0–10,9) — possível anemia moderada' },
        { max: 7.9, severity: 'high', condition: 'anemia',
          finding: 'Hemoglobina muito baixa (<8,0) — procure avaliação médica' },
      ],
    },
    {
      key: 'VCM', namePt: 'Volume Corpuscular Médio (VCM)', unit: 'fL',
      source: 'OMS/WHO — classificação de anemias (microcitose/macrocitose)',
      bands: [
        { min: 70, max: 79, severity: 'low', condition: 'anemia',
          finding: 'VCM baixo (microcitose, 70–79) — associado a alguns tipos de anemia' },
        { max: 69, severity: 'moderate', condition: 'anemia',
          finding: 'VCM muito baixo (<70, microcitose acentuada) — pode indicar anemia microcítica' },
        { min: 101, severity: 'low', condition: 'anemia',
          finding: 'VCM alto (>100, macrocitose) — pode indicar anemia macrocítica' },
      ],
    },
    // ---- ÍNDICES DERIVADOS (M2) — calculados, não extraídos do laudo ----
    {
      key: 'IMC', namePt: 'IMC (Índice de Massa Corporal)', unit: 'kg/m²',
      source: 'OMS/WHO — Índice de Massa Corporal',
      bands: [
        { max: 18.4, severity: 'low', condition: 'obesidade',
          finding: 'IMC abaixo de 18,5 (baixo peso) — pode indicar desnutrição ou perda recente; avaliar contexto clínico.' },
        { min: 25, max: 29.9, severity: 'low', condition: 'obesidade',
          finding: 'IMC na faixa de sobrepeso (25–29,9) — associado a aumento do risco cardiovascular e metabólico.' },
        { min: 30, max: 34.9, severity: 'moderate', condition: 'obesidade',
          finding: 'IMC na faixa de obesidade grau I (30–34,9) — associado a risco aumentado de diabetes e hipertensão.' },
        { min: 35, severity: 'high', condition: 'obesidade',
          finding: 'IMC na faixa de obesidade grau II ou mais (≥35) — risco aumentado; vale acompanhamento médico.' },
      ],
    },
    {
      key: 'EGFR', namePt: 'TFG estimada (eGFR)', unit: 'mL/min/1.73m²',
      source: 'CKD-EPI 2021 (race-free) — Inker et al., NEJM 2021',
      bands: [
        { min: 30, max: 59, severity: 'moderate', condition: 'renal',
          finding: 'Função renal reduzida (eGFR 30–59) — possível comprometimento renal; investigar causa e hidratação.' },
        { max: 29, severity: 'high', condition: 'renal',
          finding: 'Função renal muito reduzida (eGFR <30) — procure avaliação médica.' },
      ],
    },
    {
      key: 'HOMA_IR', namePt: 'HOMA-IR (resistência insulínica)', unit: '',
      source: 'HOMA-IR — Matthews et al., Diabetologia 1985',
      bands: [
        { min: 2.5, max: 4.99, severity: 'moderate', condition: 'insulinica',
          finding: 'HOMA-IR elevado (≥2,5) — sugere resistência insulínica, frequentemente associada a pré-diabetes/diabetes.' },
        { min: 5, severity: 'high', condition: 'insulinica',
          finding: 'HOMA-IR muito elevado (≥5) — resistência insulínica acentuada; vale avaliação médica.' },
      ],
    },
  ],

  riskPolicy: {
    severityRank: { info: 0, low: 1, moderate: 2, high: 3 },
    multiSystemEscalation: { whenDistinctConditionsGte: 2, atSeverityGte: 'moderate', becomes: 'high' },
    minMarkersForConfidence: 5,
  },

  doctorQuestions: {
    prediabetes: [
      'Esses valores indicam pré-diabetes? O que posso fazer para reverter?',
      'Devo repetir glicemia/HbA1c e investigar resistência à insulina?',
    ],
    diabetes: [
      'Esses valores indicam risco de diabetes?',
      'Preciso repetir o exame em jejum?',
      'Devo investigar resistência à insulina?',
    ],
    hypertension: [
      'Esses valores de pressão indicam hipertensão?',
      'Devo medir a pressão em casa por uma semana antes de decidir?',
      'Há risco para coração ou rins que precise investigar agora?',
    ],
    high_cholesterol: [
      'Meu perfil lipídico indica risco cardiovascular aumentado?',
      'Qual o papel de dieta e exercício antes de medicação?',
      'Preciso de outros exames (como PCR/Lp(a)) para estratificar risco?',
    ],
    cardiovascular_risk: ['HDL baixo altera meu risco cardiovascular? Como aumentar?'],
    anemia: [
      'Esses valores sugerem anemia? De que tipo?',
      'Devo investigar causa (ferro, B12, sangramento oculto)?',
      'É seguro esperar ou preciso tratar agora?',
    ],
    renal: [
      'Minha função renal (eGFR/creatinina) está preocupante?',
      'Devo repetir com proteína na urina (albuminúria) e hidratar antes?',
    ],
    obesidade: [
      'Meu IMC pede mudança de hábito ou acompanhamento específico?',
      'Vale investigar causas (tireoide, resistência insulínica)?',
    ],
    insulinica: [
      'O HOMA-IR alto indica pré-diabetes? Como reduzir?',
      'Devo repetir insulina/glicemia e ajustar dieta/exercício?',
    ],
  },

  narratives: {
    prediabetes: 'alguns marcadores glicêmicos estão na faixa de pré-diabetes. Isso costuma ser reversível com mudanças de hábito, mas merece atenção',
    diabetes: 'há alterações em glicose e/ou HbA1c que podem indicar risco metabólico aumentado',
    hypertension: 'a pressão arterial está elevada, o que pode indicar risco de hipertensão',
    high_cholesterol: 'o perfil lipídico (LDL e/ou triglicerídeos) está alterado, o que pode indicar risco cardiovascular',
    cardiovascular_risk: 'há sinais (como HDL baixo) que podem indicar risco cardiovascular',
    anemia: 'hemoglobina e/ou VCM estão alterados, o que pode sugerir anemia — o tipo precisa ser definido por um médico',
    renal: 'a função renal estimada (eGFR) está reduzida, o que pode indicar comprometimento renal',
    obesidade: 'o IMC está acima do recomendado, o que aumenta o risco cardiovascular e metabólico',
    insulinica: 'o HOMA-IR está elevado, sugerindo resistência insulínica (frequentemente associada a pré-diabetes)',
  },

  conditionLabel: {
    none: 'Sem alterações relevantes',
    prediabetes: 'Possível pré-diabetes',
    diabetes: 'Possível risco de diabetes',
    hypertension: 'Possível risco de hipertensão',
    high_cholesterol: 'Possível risco de colesterol alto',
    cardiovascular_risk: 'Possível risco cardiovascular',
    anemia: 'Possível anemia',
    renal: 'Possível comprometimento renal',
    obesidade: 'Possível sobrepeso/obesidade',
    insulinica: 'Possível resistência insulínica',
  },
};

export const MEDICAL_DISCLAIMER =
  'Esta análise é apenas educativa e não substitui avaliação médica. Nenhum resultado aqui constitui diagnóstico.';
