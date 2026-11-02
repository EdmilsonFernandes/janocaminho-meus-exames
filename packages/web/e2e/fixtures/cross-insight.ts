/**
 * Fixtures do CrossInsightBottomSheet (auditoria tipografia dinâmica 02/11/26).
 * Contrato real: `CrossInsightData` em src/components/clinical/CrossInsightBottomSheet.tsx.
 * São dados de INTERFACE (layout/escala) — não há interpretação clínica aqui.
 */
export interface MetricFixture { key: string; value: string; status: 'high' | 'normal' | 'low'; label?: 'Elevado' | 'Normal' | 'Baixo' }
export interface InsightFixture {
  has_cross_insight: boolean;
  insight_id: string;
  category: 'sports' | 'cardio' | 'metabolic' | 'hepatic';
  severity: 'critical' | 'warning' | 'info' | 'success';
  badge_text: string;
  title: string;
  metrics: MetricFixture[];
  clinical_summary: string;
  doctor_question: string;
  primary_action?: string;
  secondary_action?: string;
  signature?: string;
}

/** Fixture visual pedida pelo dono (mapeada ao contrato: badge → badge_text; label derivada no componente). */
export const BASE: InsightFixture = {
  has_cross_insight: true,
  insight_id: 'musculo_vs_figado',
  category: 'sports',
  severity: 'warning',
  badge_text: 'Modo Esporte',
  title: 'Músculo ou fígado? Seus marcadores apontam esforço físico',
  metrics: [
    { key: 'CK', value: '1.120 U/L', status: 'high', label: 'Elevado' },
    { key: 'TGO', value: '68 U/L', status: 'high', label: 'Elevado' },
    { key: 'GGT', value: '21 U/L', status: 'normal', label: 'Normal' },
  ],
  clinical_summary: 'CK e TGO altos com GGT normal costumam aparecer após treino intenso. Esta leitura é educativa e não substitui a avaliação do seu médico.',
  doctor_question: 'Meus valores de CK e TGO podem estar ligados ao treino da semana? Vale repetir o exame em repouso?',
  primary_action: 'Entendido',
  secondary_action: 'Guardar pergunta para o médico',
  signature: 'e2e-base-v1',
};

export const LONG_TITLE: InsightFixture = {
  ...BASE,
  insight_id: 'titulo_longo',
  signature: 'e2e-long-title-v1',
  title: 'Marcadores musculares e hepáticos elevados ao mesmo tempo depois de uma semana de treinos muito intensos, sem sinais de alteração biliar',
};

export const LONG_SUMMARY: InsightFixture = {
  ...BASE,
  insight_id: 'resumo_longo',
  signature: 'e2e-long-summary-v1',
  clinical_summary: Array(4).fill('CK e TGO altos com GGT normal costumam aparecer após treino intenso, principalmente quando a coleta acontece até 72 horas depois de exercícios excêntricos ou de longa duração. Hidratação, sono e o intervalo entre o treino e a coleta mudam bastante esses números.').join(' ') + ' Esta leitura é educativa e não substitui a avaliação do seu médico.',
  doctor_question: 'Considerando que treinei forte nos três dias anteriores à coleta e que a GGT ficou normal, faz sentido repetir CK e TGO após uma semana de repouso antes de investigar o fígado com outros exames?',
};

export const LONG_METRIC: InsightFixture = {
  ...BASE,
  insight_id: 'metrica_longa',
  signature: 'e2e-long-metric-v1',
  metrics: [
    { key: 'Creatinofosfoquinase total (CK-NAC)', value: '1.120.000 U/L (referência 32–294)', status: 'high', label: 'Elevado' },
    { key: 'TGO/AST', value: '68 U/L', status: 'high', label: 'Elevado' },
    { key: 'Gama-glutamiltransferase', value: '21 U/L', status: 'normal', label: 'Normal' },
  ],
};

export const MANY_METRICS: InsightFixture = {
  ...BASE,
  insight_id: 'muitas_metricas',
  signature: 'e2e-many-v1',
  metrics: [
    { key: 'CK', value: '1.120 U/L', status: 'high', label: 'Elevado' },
    { key: 'TGO', value: '68 U/L', status: 'high', label: 'Elevado' },
    { key: 'TGP', value: '54 U/L', status: 'high', label: 'Elevado' },
    { key: 'GGT', value: '21 U/L', status: 'normal', label: 'Normal' },
    { key: 'LDH', value: '310 U/L', status: 'high', label: 'Elevado' },
    { key: 'Creatinina', value: '0,9 mg/dL', status: 'normal', label: 'Normal' },
    { key: 'Ureia', value: '14 mg/dL', status: 'low', label: 'Baixo' },
    { key: 'Potássio', value: '3,3 mmol/L', status: 'low', label: 'Baixo' },
  ],
};

/** Opcionais ausentes conforme o contrato: sem primary/secondary/signature e sem `label` nas métricas. */
export const MINIMAL: InsightFixture = {
  has_cross_insight: true,
  insight_id: 'minimo',
  category: 'metabolic',
  severity: 'info',
  badge_text: 'Metabólico',
  title: 'Glicemia e triglicérides subiram juntos',
  metrics: [
    { key: 'Glicemia', value: '112 mg/dL', status: 'high' },
    { key: 'Triglicérides', value: '190 mg/dL', status: 'high' },
  ],
  clinical_summary: 'Leitura educativa. Converse com seu médico.',
  doctor_question: 'Esses dois valores juntos merecem atenção?',
};

export const SHORT: InsightFixture = {
  ...BASE,
  insight_id: 'curto',
  signature: 'e2e-short-v1',
  title: 'CK alta',
  metrics: [{ key: 'CK', value: '900 U/L', status: 'high', label: 'Elevado' }],
  clinical_summary: 'Comum após treino.',
  doctor_question: 'Repetir em repouso?',
  secondary_action: undefined,
};

export const FIXTURES: Record<string, InsightFixture> = { base: BASE, longTitle: LONG_TITLE, longSummary: LONG_SUMMARY, longMetric: LONG_METRIC, manyMetrics: MANY_METRICS, minimal: MINIMAL, short: SHORT };
