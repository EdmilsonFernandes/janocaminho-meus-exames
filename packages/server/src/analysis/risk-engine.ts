/**
 * risk-engine.ts — Motor de risco clínico (camada PRIMÁRIA, PURA, sem DB).
 *
 * Equivalente TS do `risk-ml/src/rules_engine.py` + `schema.py`. Consome a config
 * tipada em `risk-rules.ts`, avalia as bandas de cada marcador e devolve:
 *   - findings[]: o que disparou (texto PT + severidade + condição + valor + regra)
 *   - conditions: condições suspeitas (suporta multi-condição/comorbidade)
 *   - riskLevel: low / moderate / high
 *   - ruleConfidence: alta se ≥ N marcadores presentes
 *   - userExplanation + doctorQuestions (linguagem segura, não-alarmista)
 *
 * PURA: não toca em Prisma. Testável diretamente (vitest). A persistência fica em
 * `risk-service.ts`. A IA generativa (GLM) só reescreve `userExplanation` — o quadro
 * de risco é DADO, não inferido por prompt (mesma filosofia do health-state.ts).
 */
import {
  RISK_RULES, MEDICAL_DISCLAIMER,
  type Severity, type RiskCondition, type RiskBand,
} from './risk-rules';

/** Marcador de entrada: chave canônica + valor numérico (unidade padrão). */
export interface RiskMarker {
  key: string;            // ex.: 'GLICEMIA' (chave canônica do server)
  value: number;          // já na unidade padrão do marcador
  unit?: string | null;
  namePt?: string | null; // nome de exibição (fallback p/ o da regra)
  performedAt?: Date | null;
  stale?: boolean;        // medido há >12m (não invalida, mas anota confiança)
}

export interface RiskFinding {
  key: string;
  namePt: string;
  value: number;
  unit: string;
  severity: Exclude<Severity, 'info'>;
  condition: Exclude<RiskCondition, 'none'>;
  finding: string;
  band: { min?: number; max?: number; severity: Exclude<Severity, 'info'>; condition: Exclude<RiskCondition, 'none'> };
}

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface RiskResult {
  predictedConditionKey: RiskCondition;
  predictedCondition: string;     // label PT
  conditions: Exclude<RiskCondition, 'none'>[];
  riskLevel: RiskLevel;
  ruleConfidence: 'alta' | 'baixa';
  markersEvaluated: number;
  findings: RiskFinding[];
  detectedFindings: string[];
  userExplanation: string;
  doctorQuestions: string[];
  medicalDisclaimer: string;
}

const bandMatches = (v: number, b: RiskBand): boolean => {
  const lo = b.min ?? -Infinity;
  const hi = b.max ?? Infinity;
  return v >= lo && v <= hi;
};

const invRank = (rank: Record<Severity, number>): Record<number, Severity> => {
  const o: Record<number, Severity> = {};
  for (const [k, v] of Object.entries(rank)) o[v] = k as Severity;
  return o;
};

/** Monta a explicação em linguagem simples (determinística, por template). */
function buildExplanation(conditions: Exclude<RiskCondition, 'none'>[],
                          findings: RiskFinding[], riskLevel: RiskLevel): string {
  if (!conditions.length) {
    return 'Nos parâmetros analisados, não foram identificadas alterações relevantes. ' +
      'Isso não descarta a necessidade de acompanhamento médico de rotina. ' +
      'Esta análise não substitui uma consulta médica.';
  }
  const partes = conditions.map((c) => RISK_RULES.narratives[c] ?? 'há alterações em alguns marcadores');
  const intensidade = { low: 'leve a moderada', moderate: 'moderada', high: 'importante' }[riskLevel];
  const quais = findings.slice(0, 4).map((f) => f.namePt).join(', ');
  return `Atenção de intensidade ${intensidade}: ${partes.join('; ')}. ` +
    `Os exames que mais influenciaram esta análise foram: ${quais}. ` +
    'Recomendamos levar estes resultados ao seu médico para confirmação e conduta. ' +
    'Esta análise não substitui uma consulta médica.';
}

/** Núcleo puro: avalia marcadores contra as regras. */
export function assessRisk(markers: RiskMarker[]): RiskResult {
  const { markers: markerRules, riskPolicy } = RISK_RULES;
  const rank = riskPolicy.severityRank;
  const ruleByKey = new Map(markerRules.map((m) => [m.key, m]));

  const findings: RiskFinding[] = [];
  let evaluated = 0;

  for (const m of markers) {
    const rule = ruleByKey.get(m.key);
    if (!rule) continue; // marcador desconhecido das regras (ignora — não é do escopo)
    if (!Number.isFinite(m.value)) continue;
    evaluated++;
    for (const band of rule.bands) {
      if (bandMatches(m.value, band)) {
        findings.push({
          key: m.key,
          namePt: m.namePt || rule.namePt,
          value: m.value,
          unit: m.unit || rule.unit,
          severity: band.severity,
          condition: band.condition,
          finding: band.finding,
          band: { min: band.min, max: band.max, severity: band.severity, condition: band.condition },
        });
        break; // 1 finding por marcador (bandas excludentes)
      }
    }
  }

  const conditions = [...new Set(findings.map((f) => f.condition))]
    .sort() as Exclude<RiskCondition, 'none'>[];

  // riskLevel = severidade máxima
  const maxRank = findings.reduce((acc, f) => Math.max(acc, rank[f.severity]), 0);
  let riskLevel: RiskLevel = maxRank === 0 ? 'low' : (invRank(rank)[maxRank] as RiskLevel);
  if (riskLevel !== 'low' && !['low', 'moderate', 'high'].includes(riskLevel)) riskLevel = 'low';

  // escalonamento multi-sistema
  const esc = riskPolicy.multiSystemEscalation;
  const sevFloor = rank[esc.atSeverityGte];
  const distinctHigh = new Set(findings
    .filter((f) => rank[f.severity] >= sevFloor)
    .map((f) => f.condition));
  if (distinctHigh.size >= esc.whenDistinctConditionsGte) riskLevel = esc.becomes;

  // condição primária: maior severidade; desempate = MAIS findings daquela condição
  let primary: RiskCondition = 'none';
  if (findings.length) {
    const condKeys = [...new Set(findings.map((f) => f.condition))];
    const best = condKeys.sort((a, b) => {
      const ra = Math.max(...findings.filter((f) => f.condition === a).map((f) => rank[f.severity]));
      const rb = Math.max(...findings.filter((f) => f.condition === b).map((f) => rank[f.severity]));
      const ca = findings.filter((f) => f.condition === a).length;
      const cb = findings.filter((f) => f.condition === b).length;
      return rb - ra || cb - ca; // maior severidade, depois mais findings
    })[0];
    primary = best ?? 'none';
  }

  const ruleConfidence = evaluated >= riskPolicy.minMarkersForConfidence ? 'alta' : 'baixa';
  const detectedFindings = findings.map((f) => f.finding);
  const userExplanation = buildExplanation(conditions, findings, riskLevel);

  // perguntas: condição primária primeiro, depois as demais
  const order = [primary, ...conditions.filter((c) => c !== primary)].filter((c) => c !== 'none') as Exclude<RiskCondition, 'none'>[];
  const doctorQuestions: string[] = [];
  for (const c of order) {
    for (const q of RISK_RULES.doctorQuestions[c] ?? []) {
      if (!doctorQuestions.includes(q)) doctorQuestions.push(q);
    }
  }
  if (!doctorQuestions.length) doctorQuestions.push('Estes resultados estão alinhados com o esperado para meu perfil?');

  return {
    predictedConditionKey: primary,
    predictedCondition: RISK_RULES.conditionLabel[primary],
    conditions,
    riskLevel,
    ruleConfidence,
    markersEvaluated: evaluated,
    findings,
    detectedFindings,
    userExplanation,
    doctorQuestions: doctorQuestions.slice(0, 6),
    medicalDisclaimer: MEDICAL_DISCLAIMER,
  };
}
