/**
 * cross-insights.ts — Engine clínica determinística do Dr. Exame
 * Diretrizes: SBC, SBEM, SBD, ADA, KDIGO e EFLM.
 *
 * Responsável por:
 * 1. Analisar exames laboratoriais extraídos.
 * 2. Executar cálculos clínicos auditáveis (FIB-4, HOMA-IR, Razão TG/HDL, Não-HDL).
 * 3. Identificar discordâncias fisiológicas e desempates determinísticos (7 regras clínicas).
 * 4. Gerar payload estruturado para o BottomSheet do ReUI com inteligência anti-spam.
 */

import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';

export type ClinicalSeverity = 'critical' | 'warning' | 'info' | 'success';
export type ClinicalCategory = 'sports' | 'cardio' | 'metabolic' | 'hepatic';

export interface MetricChip {
  key: string;
  value: string;
  status: 'high' | 'normal' | 'low';
  label: 'Elevado' | 'Normal' | 'Baixo';
}

export interface CalculatedIndexes {
  fib4: number | null;
  homa_ir: number | null;
  tg_hdl_ratio: number | null;
  non_hdl: number | null;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
}

export interface CrossInsightItem {
  has_cross_insight: boolean;
  insight_id: string;
  category: ClinicalCategory;
  severity: ClinicalSeverity;
  badge_text: string;
  title: string;
  metrics: MetricChip[];
  clinical_summary: string;
  doctor_question: string;
  push_notification: PushNotificationPayload;
  calculated_indexes: CalculatedIndexes;
  primary_action?: string;
  secondary_action?: string;
  signature?: string;
}

export interface CrossInsightPayload extends CrossInsightItem {
  secondary_insights?: CrossInsightItem[];
}

export interface BiomarkerInput {
  name: string;
  nameCanonical?: string | null;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  isAbnormal?: boolean | null;
}

export interface PatientClinicalContext {
  ageYears?: number | null;
  sex?: 'male' | 'female' | null;
  hasTrtOrSteroids?: boolean;
}

const SEVERITY_WEIGHT: Record<ClinicalSeverity, number> = {
  critical: 4,
  warning: 3,
  info: 2,
  success: 1,
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function norm(s?: string | null): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
}

/**
 * Mapeia marcadores brutos/canônicos para chaves padrão de consulta.
 */
function buildMarkerMap(items: BiomarkerInput[]): Map<string, BiomarkerInput> {
  const map = new Map<string, BiomarkerInput>();

  const ALIASES: Record<string, string[]> = {
    CK: ['CK', 'CPK', 'CREATINOFOSFOQUINASE', 'CREATINOQUINASE'],
    TGO: ['TGO', 'AST', 'TRANSAMINASE_OXALACETICA'],
    TGP: ['TGP', 'ALT', 'TRANSAMINASE_PIRUVICA'],
    GGT: ['GGT', 'GAMA_GT', 'GAMAGT', 'GAMA_GLUTAMIL_TRANSFERASE'],
    LDL: ['LDL', 'LDL_COLESTEROL', 'COLESTEROL_LDL'],
    HDL: ['HDL', 'HDL_COLESTEROL', 'COLESTEROL_HDL'],
    TRIGLICERIDES: ['TRIGLICERIDES', 'TRIGLICERIDEOS', 'TRIGLICERIDIOS', 'TRIGLYCERIDES'],
    APOB: ['APOB', 'APO_B', 'APOLIPOPROTEINA_B', 'APOLIPOPROTEINA_B100'],
    CREATININA: ['CREATININA', 'CREATININA_SERICA'],
    CISTATINA_C: ['CISTATINA_C', 'CISTATINA'],
    EGFR_CYS: ['EGFR_CISTATINA', 'EGFR_CYS', 'FILTRACAO_GLOMERULAR_CISTATINA'],
    FERRITINA: ['FERRITINA', 'FERRITINA_SERICA'],
    PCR_US: ['PCR_US', 'PCR_ULTRASSENSIVEL', 'PROTEINA_C_REATIVA_ULTRASSENSIVEL', 'PCR'],
    VHS: ['VHS', 'VELOCIDADE_DE_HEMOSSEDIMENTACAO'],
    SATURACAO_TRANSFERRINA: ['SATURACAO_TRANSFERRINA', 'SATURACAO_DE_TRANSFERRINA', 'INDICE_DE_SATURACAO_DE_TRANSFERRINA'],
    GLICEMIA: ['GLICEMIA', 'GLICEMIA_DE_JEJUM', 'GLICOSE'],
    INSULINA: ['INSULINA', 'INSULINA_DE_JEJUM', 'INSULINA_BASAL'],
    PLAQUETAS: ['PLAQUETAS', 'CONTAGEM_DE_PLAQUETAS'],
    HEMATOCRITO: ['HEMATOCRITO', 'HT'],
    COLESTEROL_TOTAL: ['COLESTEROL_TOTAL'],
  };

  for (const it of items) {
    const rawName = norm(it.name);
    const canonical = norm(it.nameCanonical);

    for (const [standardKey, aliasList] of Object.entries(ALIASES)) {
      if (!map.has(standardKey)) {
        const matches = aliasList.some(
          (al) => canonical === al || rawName.includes(al) || al.includes(rawName)
        );
        if (matches && it.valueNumeric != null) {
          map.set(standardKey, it);
        }
      }
    }
  }

  return map;
}

/**
 * Executa a validação determinística cruzada sobre os biomarcadores.
 */
export function evaluateCrossInsights(
  items: BiomarkerInput[],
  context: PatientClinicalContext = {}
): CrossInsightPayload {
  const map = buildMarkerMap(items);

  const getNum = (key: string): number | null => map.get(key)?.valueNumeric ?? null;
  const getRefHigh = (key: string, fallback: number): number => map.get(key)?.refHigh ?? fallback;
  const getRefLow = (key: string, fallback: number): number => map.get(key)?.refLow ?? fallback;

  // Cálculos determinísticos universais
  const glicemia = getNum('GLICEMIA');
  const insulina = getNum('INSULINA');
  const tgo = getNum('TGO');
  const tgp = getNum('TGP');
  const plaquetas = getNum('PLAQUETAS');
  const tg = getNum('TRIGLICERIDES');
  const hdl = getNum('HDL');
  const colTotal = getNum('COLESTEROL_TOTAL');

  const homa_ir =
    glicemia != null && insulina != null && glicemia > 0 && insulina > 0
      ? r2((glicemia * insulina) / 405)
      : null;

  // FIB-4: se Plaquetas for fornecido em escala absoluta (>10.000), converte para 10³/µL
  let fib4: number | null = null;
  if (context.ageYears && context.ageYears > 0 && tgo != null && tgp != null && plaquetas != null && tgp > 0 && plaquetas > 0) {
    const plqK = plaquetas > 10000 ? plaquetas / 1000 : plaquetas;
    fib4 = r2((context.ageYears * tgo) / (plqK * Math.sqrt(tgp)));
  }

  const tg_hdl_ratio =
    tg != null && hdl != null && hdl > 0
      ? r1(tg / hdl)
      : null;

  const non_hdl =
    colTotal != null && hdl != null && colTotal > hdl
      ? Math.round(colTotal - hdl)
      : null;

  const calculated_indexes: CalculatedIndexes = {
    fib4,
    homa_ir,
    tg_hdl_ratio,
    non_hdl,
  };

  const detectedInsights: CrossInsightItem[] = [];

  // =========================================================================
  // REGRA_01: DANO MUSCULAR VS HEPÁTICO (Desempate Esporte / Treino de Força)
  // Diretriz EFLM / SBC: TGO e CK elevados com GGT normal e TGP normal/limítrofe.
  // =========================================================================
  const ck = getNum('CK');
  const ggt = getNum('GGT');
  if (ck != null && tgo != null) {
    const ckRefMax = getRefHigh('CK', 190);
    const tgoRefMax = getRefHigh('TGO', 40);
    const ggtRefMax = getRefHigh('GGT', 50);
    const tgpRefMax = getRefHigh('TGP', 45);

    const ckElevated = ck > ckRefMax;
    const tgoElevated = tgo > tgoRefMax;
    const ggtNormal = ggt != null ? ggt <= ggtRefMax : true;
    const tgpNormalOrMild = tgp != null ? tgp <= 1.3 * tgpRefMax : true;

    if (ckElevated && tgoElevated && ggtNormal && tgpNormalOrMild) {
      detectedInsights.push({
        has_cross_insight: true,
        insight_id: 'musculo_vs_figado',
        category: 'sports',
        severity: 'info',
        badge_text: 'Modo Esporte',
        title: 'Fígado vs. Regeneração Muscular',
        metrics: [
          { key: 'CK', value: `${ck.toLocaleString('pt-BR')} U/L`, status: 'high', label: 'Elevado' },
          { key: 'TGO', value: `${tgo.toLocaleString('pt-BR')} U/L`, status: 'high', label: 'Elevado' },
          { key: 'GGT', value: `${(ggt ?? 21).toLocaleString('pt-BR')} U/L`, status: 'normal', label: 'Normal' },
        ],
        clinical_summary:
          'A elevação de CK e TGO, com GGT normal, sugere que o esforço físico intenso (como treinos de força) causou essa alteração, sem indicativo de lesão no fígado.',
        doctor_question:
          'Doutor, tive alteração de CK e TGO pós-treino, mas a GGT deu normal. Pode ser do esforço?',
        push_notification: {
          title: '🏋️ Treinou pesado recentemente?',
          body: 'Seu TGO e CK vieram altos, mas o fígado está protegido (GGT normal). Toque para entender.',
        },
        calculated_indexes,
        primary_action: 'Entendido',
        secondary_action: 'Adicionar à Consulta',
      });
    }
  }

  // =========================================================================
  // REGRA_02: RISCO ATEROGÊNICO OCULTO (DISCORDÂNCIA DE ApoB)
  // Diretriz SBC / ADA / EFLM: LDL <= 100 com ApoB > 90 ou TG/HDL > 3.0.
  // =========================================================================
  const ldl = getNum('LDL');
  const apob = getNum('APOB');
  if (ldl != null && ldl <= 100) {
    const apobHigh = apob != null && apob > 90;
    const ratioHigh = tg_hdl_ratio != null && tg_hdl_ratio > 3.0;

    if (apobHigh || ratioHigh) {
      const metrics: MetricChip[] = [
        { key: 'LDL', value: `${ldl} mg/dL`, status: 'normal', label: 'Normal' },
      ];
      if (apob != null) {
        metrics.push({ key: 'ApoB', value: `${apob} mg/dL`, status: 'high', label: 'Elevado' });
      }
      if (tg_hdl_ratio != null) {
        metrics.push({ key: 'TG/HDL', value: `${tg_hdl_ratio}`, status: 'high', label: 'Elevado' });
      }

      detectedInsights.push({
        has_cross_insight: true,
        insight_id: 'discordancia_aterogenica',
        category: 'cardio',
        severity: 'warning',
        badge_text: 'Cardiovascular',
        title: 'Discordância Aterogênica (ApoB vs. LDL)',
        metrics,
        clinical_summary:
          'Discordância aterogênica. O número real de partículas aterogênicas (ApoB / LDL pequenas e densas) está elevado, apesar do LDL convencional estar na meta de referência.',
        doctor_question:
          'Doutor, meu LDL está na meta, mas o ApoB (ou razão TG/HDL) veio elevado. Vale nortear minha conduta pelo ApoB para avaliar o risco cardiovascular real?',
        push_notification: {
          title: '❤️ Atenção ao perfil lipídico',
          body: 'Seu LDL está na meta, mas identificamos discordância aterogênica. Veja o que conversar com o médico.',
        },
        calculated_indexes,
        primary_action: 'Entendido',
        secondary_action: 'Adicionar à Consulta',
      });
    }
  }

  // =========================================================================
  // REGRA_03: FALSO POSITIVO RENAL EM ATLETA (Creatinina vs. Cistatina-C)
  // Diretriz KDIGO: Creatinina > ref com Cistatina-C normal ou eGFR >= 90.
  // =========================================================================
  const creatinina = getNum('CREATININA');
  const cistatina = getNum('CISTATINA_C');
  const egfrCys = getNum('EGFR_CYS');
  if (creatinina != null) {
    const creatRefMax = getRefHigh('CREATININA', 1.2);
    const cistRefMax = getRefHigh('CISTATINA_C', 1.0);

    const creatHigh = creatinina > creatRefMax;
    const cistNormal = cistatina != null && cistatina <= cistRefMax;
    const egfrPreserved = egfrCys != null && egfrCys >= 90;

    if (creatHigh && (cistNormal || egfrPreserved)) {
      const metrics: MetricChip[] = [
        { key: 'Creatinina', value: `${creatinina} mg/dL`, status: 'high', label: 'Elevado' },
      ];
      if (cistatina != null) {
        metrics.push({ key: 'Cistatina-C', value: `${cistatina} mg/L`, status: 'normal', label: 'Normal' });
      }
      if (egfrCys != null) {
        metrics.push({ key: 'eGFR Cys', value: `${egfrCys} mL/min`, status: 'normal', label: 'Normal' });
      }

      detectedInsights.push({
        has_cross_insight: true,
        insight_id: 'falsa_disfuncao_renal',
        category: 'sports',
        severity: 'success',
        badge_text: 'Modo Esporte',
        title: 'Massa Muscular vs. Filtração Renal',
        metrics,
        clinical_summary:
          'Creatinina elevada por massa muscular e/ou suplementação de creatina. A taxa de filtração por Cistatina-C comprova função renal preservada.',
        doctor_question:
          'Doutor, a Cistatina-C comprova minha filtração glomerular preservada. A creatinina alta pode ser atribuída apenas à massa muscular e treino?',
        push_notification: {
          title: '💪 Creatinina vs. Músculo',
          body: 'Sua creatinina veio alterada, mas sua Cistatina-C indica rins normais. Entenda o efeito do treino.',
        },
        calculated_indexes,
        primary_action: 'Entendido',
        secondary_action: 'Adicionar à Consulta',
      });
    }
  }

  // =========================================================================
  // REGRA_04: FERRITINA INFLAMATÓRIA (FALSA SOBRECARGA)
  // Ferritina > 300 com PCR-us > 1.0 ou VHS > 20, e Saturação Transferrina <= 45%.
  // =========================================================================
  const ferritina = getNum('FERRITINA');
  const pcr = getNum('PCR_US');
  const vhs = getNum('VHS');
  const satTransf = getNum('SATURACAO_TRANSFERRINA');
  if (ferritina != null && ferritina > 300) {
    const inflammed = (pcr != null && pcr > 1.0) || (vhs != null && vhs > 20);
    const normalSaturation = satTransf != null ? satTransf <= 45 : true;

    if (inflammed && normalSaturation) {
      const metrics: MetricChip[] = [
        { key: 'Ferritina', value: `${ferritina} ng/mL`, status: 'high', label: 'Elevado' },
      ];
      if (pcr != null) {
        metrics.push({ key: 'PCR-us', value: `${pcr} mg/L`, status: 'high', label: 'Elevado' });
      } else if (vhs != null) {
        metrics.push({ key: 'VHS', value: `${vhs} mm`, status: 'high', label: 'Elevado' });
      }
      if (satTransf != null) {
        metrics.push({ key: 'Sat. Transferrina', value: `${satTransf}%`, status: 'normal', label: 'Normal' });
      }

      detectedInsights.push({
        has_cross_insight: true,
        insight_id: 'ferritina_inflamatoria',
        category: 'metabolic',
        severity: 'info',
        badge_text: 'Inflamação & Imunidade',
        title: 'Ferritina Inflamatória vs. Sobrecarga de Ferro',
        metrics,
        clinical_summary:
          'Ferritina elevada agindo como reagente inflamatório de fase aguda. Com saturação de transferrina normal, não há evidência de sobrecarga primária de ferro.',
        doctor_question:
          'Doutor, minha ferritina veio alta acompanhada de marcador inflamatório elevado. Pode ser uma resposta inflamatória pontual em vez de acúmulo de ferro?',
        push_notification: {
          title: '🛡️ Ferritina e Inflamação',
          body: 'Ferritina alta com saturação normal indica resposta inflamatória, não sobrecarga de ferro.',
        },
        calculated_indexes,
        primary_action: 'Entendido',
        secondary_action: 'Adicionar à Consulta',
      });
    }
  }

  // =========================================================================
  // REGRA_05: METABOLISMO GLICÊMICO (HOMA-IR CALCULADO)
  // Diretrizes SBD / SBEM / ADA: HOMA-IR > 2.7 indica resistência à insulina.
  // =========================================================================
  if (homa_ir != null && homa_ir > 2.7) {
    detectedInsights.push({
      has_cross_insight: true,
      insight_id: 'homa_ir_elevado',
      category: 'metabolic',
      severity: 'warning',
      badge_text: 'Metabolismo',
      title: 'Resistência Insulínica Precoce (HOMA-IR)',
      metrics: [
        { key: 'HOMA-IR', value: `${homa_ir}`, status: 'high', label: 'Elevado' },
        { key: 'Glicemia', value: `${glicemia} mg/dL`, status: glicemia! > 99 ? 'high' : 'normal', label: glicemia! > 99 ? 'Elevado' : 'Normal' },
        { key: 'Insulina', value: `${insulina} µUI/mL`, status: 'high', label: 'Elevado' },
      ],
      clinical_summary: `Índice HOMA-IR em ${homa_ir}, indicando resistência à ação da insulina antes mesmo da glicemia de jejum descompensar.`,
      doctor_question: `Doutor, meu HOMA-IR indicou resistência à insulina (${homa_ir}). Quais ajustes de dieta, treino ou acompanhamento devemos focar?`,
      push_notification: {
        title: '🍬 Alerta metabólico: HOMA-IR',
        body: `Identificamos resistência à insulina (HOMA-IR ${homa_ir}). Toque para ver como se preparar para a consulta.`,
      },
      calculated_indexes,
      primary_action: 'Entendido',
      secondary_action: 'Adicionar à Consulta',
    });
  }

  // =========================================================================
  // REGRA_06: ESCORE DE FIBROSE HEPÁTICA (FIB-4 CALCULADO)
  // Diretrizes SBEM / EASL: FIB-4 > 2.67 indica risco elevado de fibrose.
  // =========================================================================
  if (fib4 != null && fib4 > 2.67) {
    const plqVal = plaquetas! > 10000 ? Math.round(plaquetas! / 1000) : plaquetas;
    detectedInsights.push({
      has_cross_insight: true,
      insight_id: 'fib4_elevado',
      category: 'hepatic',
      severity: 'critical',
      badge_text: 'Fígado & Digestivo',
      title: 'Atenção ao Escore de Fibrose Hepática (FIB-4)',
      metrics: [
        { key: 'FIB-4', value: `${fib4}`, status: 'high', label: 'Elevado' },
        { key: 'TGO', value: `${tgo} U/L`, status: 'high', label: 'Elevado' },
        { key: 'TGP', value: `${tgp} U/L`, status: 'high', label: 'Elevado' },
        { key: 'Plaquetas', value: `${plqVal}k/µL`, status: 'normal', label: 'Normal' },
      ],
      clinical_summary: `Escore FIB-4 elevado (${fib4}), apontando necessidade de investigação de risco de fibrose hepática com seu médico.`,
      doctor_question: `Doutor, o cálculo de FIB-4 deu alterado (${fib4}). Seria indicado realizar uma elastografia hepática ou ultrassom?`,
      push_notification: {
        title: '🫀 Atenção à saúde hepática',
        body: `Cálculo do escore FIB-4 (${fib4}) sugere investigação complementar com seu médico. Toque para entender.`,
      },
      calculated_indexes,
      primary_action: 'Entendido',
      secondary_action: 'Adicionar à Consulta',
    });
  }

  // =========================================================================
  // REGRA_07: VISCOSIDADE SANGUÍNEA EM TRT / REPOSIÇÃO
  // Hematócrito > 52% (Homens) ou > 48% (Mulheres) com contexto hormonal.
  // =========================================================================
  const ht = getNum('HEMATOCRITO');
  if (ht != null) {
    const isFemale = context.sex === 'female';
    const htCutoff = isFemale ? 48 : 52;

    if (ht > htCutoff && context.hasTrtOrSteroids) {
      detectedInsights.push({
        has_cross_insight: true,
        insight_id: 'viscosidade_trt',
        category: 'sports',
        severity: 'warning',
        badge_text: 'Modo Esporte / TRT',
        title: 'Viscosidade Sanguínea e Reposição Hormonal',
        metrics: [
          { key: 'Hematócrito', value: `${ht}%`, status: 'high', label: 'Elevado' },
        ],
        clinical_summary: `Eritrocitose com hematócrito em ${ht}%. Há risco de aumento da viscosidade sanguínea associado à terapia de reposição hormonal.`,
        doctor_question: `Doutor, meu hematócrito bateu ${ht}%. Precisamos ajustar o espaçamento da dose da reposição hormonal ou avaliar sangria/hidratação?`,
        push_notification: {
          title: '🩸 Alerta de Hematócrito / TRT',
          body: `Hematócrito em ${ht}% com reposição hormonal. Toque para ver orientações para sua consulta.`,
        },
        calculated_indexes,
        primary_action: 'Entendido',
        secondary_action: 'Adicionar à Consulta',
      });
    }
  }

  // Se nenhum cruzamento anômalo foi acionado
  if (detectedInsights.length === 0) {
    return {
      has_cross_insight: false,
      insight_id: 'nenhum_cruzamento',
      category: 'metabolic',
      severity: 'info',
      badge_text: 'Exames em Dia',
      title: 'Padrão Laboratorial Estável',
      metrics: [],
      clinical_summary:
        'Não foram identificadas discordâncias aterogênicas, sobrecargas musculares discrepantes ou alterações em índices clínicos calculados.',
      doctor_question: 'Doutor, meus principais marcadores calculados mantêm-se dentro do padrão esperado?',
      push_notification: {
        title: 'Seus exames estão estáveis',
        body: 'Nenhum cruzamento crítico detectado no último laudo.',
      },
      calculated_indexes,
    };
  }

  // Priorização por severidade (critical > warning > info > success)
  detectedInsights.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

  const primary = detectedInsights[0];
  const secondary = detectedInsights.slice(1);

  // Assinatura única para controle anti-repetição / dedup
  const metricSig = primary.metrics.map((m) => `${m.key}:${m.value}`).join(';');
  primary.signature = `${primary.insight_id}_${metricSig}`;

  return {
    ...primary,
    secondary_insights: secondary.length > 0 ? secondary : undefined,
  };
}

/**
 * Notifica o paciente via push e in-app de forma estritamente idempotente.
 * Se o paciente já recebeu notificação com esta MESMA assinatura, não reenvia.
 */
export async function notifyCrossInsightIfNew(
  userId: string,
  insight: CrossInsightPayload
): Promise<boolean> {
  if (!insight.has_cross_insight || !insight.signature) return false;

  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'cross_insight',
      data: {
        path: ['signature'],
        equals: insight.signature,
      },
    },
    select: { id: true },
  });

  if (existing) {
    // Já notificado anteriormente para este mesmo conjunto de resultados laboratoriais
    return false;
  }

  await sendPushToUser(
    userId,
    insight.push_notification.title,
    insight.push_notification.body,
    {
      type: 'cross_insight',
      insight_id: insight.insight_id,
      signature: insight.signature,
      crossInsight: JSON.stringify(insight) as any,
    } as any
  );

  return true;
}


