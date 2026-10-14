import type { MarkerState } from './health-state';
import type { ClinicalIndexResult } from './clinical-indices';

/**
 * Perguntas pra levar ao médico — motor DETERMINÍSTICO (zero IA).
 *
 * Cumpre a promessa da landing ("Avaliação de Risco Clínico / ações sugeridas") SEM
 * cruzar a fronteira SaMD (RDC 657): nunca prescreve, nunca diagnostica — transforma
 * índices/marcadores alterados em PERGUNTAS graduadas com fonte de diretriz BR.
 * Guardrail do painel INAEP 12/10: linguagem educativa + médico no loop.
 */

export interface ClinicalAction {
  domain: string;
  emoji: string;
  title: string;
  /** Pergunta pronta, em 1ª pessoa do paciente. */
  question: string;
  /** Evidência do PRÓPRIO usuário (índices/valores que motivam a pergunta). */
  rationale: string;
  /** Diretriz/fonte citada — mesmo padrão das diretrizes SBC/SBD já usadas no app. */
  source: string;
  timeframe: 'agora' | 'semanas' | 'rotina';
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

interface DomainRule {
  domain: string;
  emoji: string;
  /** Keys de índices clínicos que pertencem ao domínio (level ≠ 'bom' dispara). */
  indexKeys: string[];
  /** Substring (maiúscula, sem acento) de canonical de marcador que dispara (alterado). */
  markerIncludes?: string[];
  title: string;
  question: string;
  source: string;
  timeframe: ClinicalAction['timeframe'];
}

const RULES: DomainRule[] = [
  {
    domain: 'Coração & vasos',
    emoji: '❤️',
    indexKeys: ['castelli_i', 'castelli_ii', 'tg_hdl', 'aip', 'non_hdl'],
    markerIncludes: ['LDL', 'TRIGLICERIDES', 'COLESTEROL'],
    title: 'Reavaliar risco cardiovascular',
    question: 'Com meu painel lipídico atual, vale a pena repetir a dosagem em 4–12 semanas junto com mudança de hábitos, ou o(a) senhor(a) prefere outra conduta?',
    source: 'SBC — Diretriz Brasileira de Prevenção Cardiovascular',
    timeframe: 'semanas',
  },
  {
    domain: 'Glicemia & metabolismo',
    emoji: '🍬',
    indexKeys: ['homa_ir', 'tyg'],
    markerIncludes: ['GLICEMIA', 'HEMOGLOBINA_GLICADA', 'INSULINA'],
    title: 'Conversar sobre rastreio de diabetes',
    question: 'Meus valores glicêmicos sugerem resistência à insulina — seria indicado dosar hemoglobina glicada (HbA1c) ou já discutir prevenção?',
    source: 'SBD — Diretrizes da Sociedade Brasileira de Diabetes',
    timeframe: 'semanas',
  },
  {
    domain: 'Rim',
    emoji: '🫘',
    indexKeys: ['egfr'],
    markerIncludes: ['CREATININA', 'UREIA'],
    title: 'Avaliar função renal',
    question: 'Como está minha função renal (filtração/creatinina)? Preciso ajustar hidratação, medicações ou repetir exame em breve?',
    source: 'SBN/KDIGO — diretrizes de doença renal crônica',
    timeframe: 'agora',
  },
  {
    domain: 'Fígado',
    emoji: '🫀',
    indexKeys: ['fib4'],
    markerIncludes: ['TGP', 'TGO', 'GAMA_GT'],
    title: 'Conversar sobre saúde hepática',
    question: 'Meus exames sugerem possível esteatose (gordura no fígado) — vale investigar com ultrassom ou outras medidas?',
    source: 'EASL/SBH — esteatose hepática metabólica',
    timeframe: 'rotina',
  },
  {
    domain: 'Tireoide',
    emoji: '🦋',
    indexKeys: [],
    markerIncludes: ['TSH', 'T4_LIVRE'],
    title: 'Investigar tireoide',
    question: 'Meu TSH está fora da faixa — é indicado dosar T4 livre e anticorpos, ou apenas acompanhar?',
    source: 'SBEM — Sociedade Brasileira de Endocrinologia e Metabologia',
    timeframe: 'semanas',
  },
  {
    domain: 'Sangue',
    emoji: '🩸',
    indexKeys: [],
    markerIncludes: ['HEMOGLOBINA', 'FERRITINA'],
    title: 'Investigar anemia (se houver)',
    question: 'Minha hemoglobina está baixa — faz sentido investigar causa com ferritina, B12 e avaliação clínica?',
    source: 'ABHH — Associação Brasileira de Hematologia',
    timeframe: 'rotina',
  },
  {
    domain: 'Hormônios',
    emoji: '⚗️',
    indexKeys: ['lh_fsh', 'fai'],
    markerIncludes: ['TESTOSTERONA'],
    title: 'Avaliação hormonal',
    question: 'Meus índices hormonais (LH/FSH, androgênios) merecem investigação, ou são variação normal pro meu quadro?',
    source: 'SBEM — diretrizes de avaliação hormonal',
    timeframe: 'rotina',
  },
];

/**
 * Gera as perguntas (máx. 1 por domínio, cap 6) a partir dos índices clínicos já
 * computados + marcadores alterados. Determinístico e puro — testável sem IO.
 */
export function computeClinicalActions(
  markers: MarkerState[],
  indices: ClinicalIndexResult[],
): ClinicalAction[] {
  const out: ClinicalAction[] = [];
  const badIndices = indices.filter((i) => i.level !== 'bom');
  const badMarkers = markers.filter((m) => m.priority !== 'normal');

  for (const rule of RULES) {
    const evidence: string[] = [];

    for (const i of badIndices) {
      if (rule.indexKeys.includes(i.key)) evidence.push(`${i.name} ${fmt(i.value)}`);
    }
    for (const m of badMarkers) {
      const inc = (rule.markerIncludes ?? []).some((s) => m.nameCanonical.includes(s));
      if (inc && m.latest.valueNumeric != null) evidence.push(`${m.name} ${fmt(m.latest.valueNumeric)}${m.unit ? ' ' + m.unit : ''}`);
      else if (inc && m.latest.valueText) evidence.push(`${m.name} ${m.latest.valueText}`);
    }

    if (evidence.length === 0) continue;
    // Dedup de evidência (mesmo índice + marcador podem redundar) e cap racional.
    const uniq = [...new Set(evidence)].slice(0, 4);

    out.push({
      domain: rule.domain,
      emoji: rule.emoji,
      title: rule.title,
      question: rule.question,
      rationale: uniq.join(' · '),
      source: rule.source,
      timeframe: rule.timeframe,
    });
  }

  // 'agora' (maior prioridade de conversa) primeiro, depois 'semanas', 'rotina'.
  const ORDER = { agora: 0, semanas: 1, rotina: 2 } as const;
  return out.sort((a, b) => ORDER[a.timeframe] - ORDER[b.timeframe]).slice(0, 6);
}
