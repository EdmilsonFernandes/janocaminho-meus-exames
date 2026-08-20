import { prisma } from '../prisma';
import { buildBaseline, compareBaselines, type BaselineComparison } from './activity-baseline';

/**
 * CorrelationEngine — detecta correlações entre mudanças de hábito (Health Connect)
 * e mudanças em biomarcadores (exames), com classificação de evidência científica.
 *
 * PRINCÍPIO: NUNCA afirma causalidade. Só reporta que mudanças ocorreram
 * no mesmo período e cita a associação conhecida pela literatura.
 * A LLM (IA) só traduz a conclusão estruturada — NUNCA inventa.
 */

export interface CorrelationFinding {
  biomarker: string;          // ex.: "LDL"
  hcMetric: string;           // ex.: "avgSteps"
  hcMetricLabel: string;      // ex.: "atividade física"
  biomarkerDelta: number;     // % de mudança
  hcDelta: number;            // % de mudança
  biomarkerFrom: number;
  biomarkerTo: number;
  hcFrom: number;
  hcTo: number;
  direction: 'both_improved' | 'both_worsened' | 'divergent';
  evidenceLevel: 'HIGH' | 'MODERATE' | 'EXPLORATORY';
  confidenceScore: number;    // 0-1 (cobertura × persistência × força)
  evidenceSource: string;     // ex.: "AHA 2023"
  evidenceStatement: string;  // texto educativo com disclaimer
  windowDays: number;
}

/**
 * MATRIZ DE CORRELAÇÃO — evidência científica por cruzamento.
 * Só cruzamentos com evidência suficiente entram aqui. O resto é bloqueado.
 */
const CORRELATION_MATRIX: {
  biomarkerPattern: RegExp;
  hcMetric: 'avgSteps' | 'avgKm' | 'avgWeightKg' | 'avgSystolic';
  hcMetricLabel: string;
  betterWhen: 'hc_up_bio_down' | 'hc_down_bio_down' | 'hc_up_bio_up' | 'hc_down_bio_up';
  evidenceLevel: 'HIGH' | 'MODERATE' | 'EXPLORATORY';
  source: string;
  statement: string;
}[] = [
  // LIPÍDIOS × ATIVIDADE
  {
    biomarkerPattern: /ldl|colesterol total|não-hdl|nao-hdl/i,
    hcMetric: 'avgSteps', hcMetricLabel: 'atividade física',
    betterWhen: 'hc_up_bio_down',
    evidenceLevel: 'HIGH',
    source: 'AHA/ESC 2023',
    statement: 'Atividade física regular (150+ min/semana) está associada à redução de LDL e colesterol total. Alimentação, peso, medicamentos e genética também influenciam.',
  },
  {
    biomarkerPattern: /hdl/i,
    hcMetric: 'avgSteps', hcMetricLabel: 'atividade física',
    betterWhen: 'hc_up_bio_up',
    evidenceLevel: 'HIGH',
    source: 'AHA 2023',
    statement: 'Atividade física aeróbica regular está associada ao aumento de HDL ("bom colesterol"). O efeito depende de intensidade, duração e frequência.',
  },
  {
    biomarkerPattern: /triglic/i,
    hcMetric: 'avgSteps', hcMetricLabel: 'atividade física',
    betterWhen: 'hc_up_bio_down',
    evidenceLevel: 'HIGH',
    source: 'ADA/ESC 2023',
    statement: 'Atividade física regular e perda de peso estão associadas à redução de triglicerídeos. Dieta (especialmente carboidratos e álcool) também influencia fortemente.',
  },
  // GLICEMIA × ATIVIDADE
  {
    biomarkerPattern: /glicose|glicemi|hba1c|glicosilada|hemoglobina glicosilada/i,
    hcMetric: 'avgSteps', hcMetricLabel: 'atividade física',
    betterWhen: 'hc_up_bio_down',
    evidenceLevel: 'HIGH',
    source: 'ADA Standards of Care 2024',
    statement: 'Atividade física regular melhora a sensibilidade à insulina e está associada à redução da glicose e HbA1c. Dieta, medicamentos e peso também influenciam.',
  },
  // GLICEMIA × PESO
  {
    biomarkerPattern: /glicose|glicemi|hba1c|glicosilada|triglic/i,
    hcMetric: 'avgWeightKg', hcMetricLabel: 'peso corporal',
    betterWhen: 'hc_down_bio_down',
    evidenceLevel: 'HIGH',
    source: 'ADA/SBC 2023',
    statement: 'Perda de peso de 5-10% está associada a melhora da glicemia e perfil lipídico. É uma das intervenções de primeira linha no manejo metabólico.',
  },
  // LIPÍDIOS × PESO
  {
    biomarkerPattern: /ldl|triglic|colesterol/i,
    hcMetric: 'avgWeightKg', hcMetricLabel: 'peso corporal',
    betterWhen: 'hc_down_bio_down',
    evidenceLevel: 'HIGH',
    source: 'ESC/SBC 2023',
    statement: 'Perda de peso moderada está associada à melhora do perfil lipídico, especialmente triglicerídeos e HDL.',
  },
  // PA × ATIVIDADE
  {
    biomarkerPattern: /pressão|pressao|sistólica|sistolica|pa /i,
    hcMetric: 'avgSteps', hcMetricLabel: 'atividade física',
    betterWhen: 'hc_up_bio_down',
    evidenceLevel: 'HIGH',
    source: 'AHA/ESC 2023',
    statement: 'Atividade física aeróbica regular está associada à redução da pressão arterial sistólica em 5-8 mmHg em média. Sal, peso e estresse também influenciam.',
  },
  // PA × PESO
  {
    biomarkerPattern: /pressão|pressao|sistólica|sistolica/i,
    hcMetric: 'avgWeightKg', hcMetricLabel: 'peso corporal',
    betterWhen: 'hc_down_bio_down',
    evidenceLevel: 'MODERATE',
    source: 'ESC 2023',
    statement: 'Perda de peso está associada à redução da pressão arterial. Cada kg perdido associa-se a ~1 mmHg de redução na sistólica.',
  },
  // INFLAMAÇÃO × ATIVIDADE
  {
    biomarkerPattern: /pcr|proteina c reativa|proteína c reativa|vhs/i,
    hcMetric: 'avgSteps', hcMetricLabel: 'atividade física',
    betterWhen: 'hc_up_bio_down',
    evidenceLevel: 'MODERATE',
    source: 'Estudos observacionais',
    statement: 'Estilo de vida ativo está associado a menores níveis de marcadores inflamatórios. Infecções e outras condições também elevam PCR.',
  },
];

/**
 * Detecta correlações entre exames e hábitos para um paciente.
 */
export async function detectCorrelations(patientId: string): Promise<CorrelationFinding[]> {
  // Último exame extraído
  const lastExam = await prisma.exam.findFirst({
    where: { patientId, status: 'EXTRACTED' },
    orderBy: { performedAt: 'desc' },
    select: { performedAt: true },
  });
  if (!lastExam?.performedAt) return [];

  // Baselines antes/depois
  const comparison = await compareBaselines(patientId, lastExam.performedAt);
  if (!comparison || !comparison.previous) return [];

  // Itens do exame com mudanças
  const exams = await prisma.exam.findMany({
    where: { patientId, status: 'EXTRACTED' },
    orderBy: { performedAt: 'desc' },
    take: 2,
    select: { performedAt: true, items: { select: { name: true, nameCanonical: true, valueNumeric: true } } },
  });
  if (exams.length < 2) return [];

  const [latest, prior] = exams;
  const findings: CorrelationFinding[] = [];

  for (const rule of CORRELATION_MATRIX) {
    // Encontra o biomarcador que casa com o padrão
    const latestItem = latest.items.find((i) => rule.biomarkerPattern.test(i.name || i.nameCanonical || ''));
    const priorItem = prior.items.find((i) => rule.biomarkerPattern.test(i.name || i.nameCanonical || ''));
    if (!latestItem?.valueNumeric || !priorItem?.valueNumeric || priorItem.valueNumeric === 0) continue;

    const bioFrom = priorItem.valueNumeric;
    const bioTo = latestItem.valueNumeric;
    const bioDelta = Math.round(((bioTo - bioFrom) / Math.abs(bioFrom)) * 100);

    // Encontra o hábito correspondente
    const hcChange = comparison.changes.find((c) => c.metric === rule.hcMetric);
    if (!hcChange) continue;

    const hcFrom = hcChange.from;
    const hcTo = hcChange.to;
    const hcDelta: number = hcChange.deltaPct ?? 0;

    // Determina direção
    const hcWentUp = hcDelta > 0;
    const bioWentDown = bioDelta < 0;
    const bioWentUp = bioDelta > 0;

    let direction: CorrelationFinding['direction'] = 'divergent';
    switch (rule.betterWhen) {
      case 'hc_up_bio_down':
        direction = hcWentUp && bioWentDown ? 'both_improved' : (!hcWentUp && bioWentUp ? 'both_worsened' : 'divergent');
        break;
      case 'hc_down_bio_down':
        direction = !hcWentUp && bioWentDown ? 'both_improved' : (hcWentUp && bioWentUp ? 'both_worsened' : 'divergent');
        break;
      case 'hc_up_bio_up':
        direction = hcWentUp && bioWentUp ? 'both_improved' : 'divergent';
        break;
      case 'hc_down_bio_up':
        direction = !hcWentUp && bioWentUp ? 'both_improved' : 'divergent';
        break;
    }

    if (direction === 'divergent') continue; // só reporta convergências

    // Score de confiança: cobertura × magnitude × evidência
    const coverage = comparison.current.coverage;
    const magnitude = Math.min(1, (Math.abs(bioDelta) + Math.abs(hcDelta)) / 40);
    const evidenceWeight = rule.evidenceLevel === 'HIGH' ? 1 : rule.evidenceLevel === 'MODERATE' ? 0.7 : 0.4;
    const confidenceScore = Math.round(coverage * magnitude * evidenceWeight * 100) / 100;

    // Só reporta se houver confiança mínima
    if (confidenceScore < 0.3) continue;

    findings.push({
      biomarker: latestItem.name || latestItem.nameCanonical || rule.biomarkerPattern.source,
      hcMetric: rule.hcMetric,
      hcMetricLabel: rule.hcMetricLabel,
      biomarkerDelta: bioDelta,
      hcDelta,
      biomarkerFrom: bioFrom,
      biomarkerTo: bioTo,
      hcFrom,
      hcTo,
      direction,
      evidenceLevel: rule.evidenceLevel,
      confidenceScore,
      evidenceSource: rule.source,
      evidenceStatement: rule.statement,
      windowDays: comparison.current.windowDays,
    });
  }

  return findings.sort((a, b) => b.confidenceScore - a.confidenceScore);
}
