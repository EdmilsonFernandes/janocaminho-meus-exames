/**
 * Motor de dicas inteligentes (PURO, sem DB/LLM — testável) — usado pelo job healthNudges.
 *
 * Princípios (pedido do dono 25/09/26: dica que faça o usuário pensar "caramba, inteligente"):
 * 1. A dica fala do DADO do paciente — marcador com valores e tendência, atividade da semana,
 *    tempo desde o último exame — não de um "segmento" genérico compartilhado com todo mundo.
 * 2. ROTAÇÃO DE TEMA com memória: o tema das últimas dicas (notification.data.theme) desempata
 *    a escolha — nada de repetir o mesmo assunto semana após semana.
 * 3. O GLM gera POR PACIENTE e recebe as dicas anteriores para não repetir frase/ângulo.
 * 4. Fallback curado POR TEMA já preenchido com os dados reais: se o GLM cair, a dica
 *    continua específica (template com nome, valor e tendência do marcador).
 */

export type TipTheme = 'melhora' | 'atencao' | 'cardio' | 'movimento' | 'exame-velho' | 'rotina';
export type Segment = 'colesterol' | 'glicemia' | 'pressao' | 'anemia' | 'tireoide' | 'renal' | 'rotina';

export interface TipMarker {
  name: string;
  value: number | null;
  prev: number | null;
  unit: string | null;
  deltaPct: number | null;
  flag: string;
  refHigh: number | null;
}

export interface TipContext {
  firstName: string;
  score: number | null;
  daysSinceExam: number | null;
  stale: boolean;
  improving: TipMarker[];
  worsening: TipMarker[];
  cardioLevel: string; // '' | 'baixo' | 'moderado' | 'alto'
  cardioFactors: number;
  /** Minutos ativos nos últimos 7d — null = paciente não sincroniza atividade (não é sedentário). */
  activeMinutesWeek: number | null;
  activeMinutesPrevWeek: number | null;
  stepsAvgDay: number | null;
  restingHr: number | null;
  medications: string[];
  segment: Segment;
}

const fmt = (v: number | null | undefined): string =>
  v == null ? '?' : Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');

const THEME_LABEL: Record<TipTheme, string> = {
  melhora: 'comemorar uma melhora real de marcador',
  atencao: 'marcador que piorou (atenção, sem alarmismo)',
  cardio: 'risco cardiometabólico',
  movimento: 'movimento/atividade física da semana',
  'exame-velho': 'exames desatualizados',
  rotina: 'manutenção/prevenção de rotina',
};

// ── Segmento (só p/ fallback de rotina — classifica pelo texto do histórico/perfil) ──
const SEGMENT_RULES: { seg: Segment; test: RegExp }[] = [
  { seg: 'colesterol', test: /(ldl|colesterol|triglicer|hdl|lipid)/i },
  { seg: 'glicemia', test: /(glicemia|glicose|hemoglobina glic|hba1c|insulina|homair|glicada)/i },
  { seg: 'pressao', test: /(pressao|pa\b|arterial|sistol|diastol|has\b)/i },
  { seg: 'tireoide', test: /(tsh|t4\b|t4livre|tiro|levotiroxina)/i },
  { seg: 'anemia', test: /(hemoglobin|hematocrito|ferro|ferritina|eritro|vcm|hcm)/i },
  { seg: 'renal', test: /(creatinina|ureia|egfr|renal|microalbumin|tfg)/i },
];

export function classifySegment(text: string): Segment {
  for (const r of SEGMENT_RULES) if (r.test.test(text)) return r.seg;
  return 'rotina';
}

// ── Semana sedentária? (OMS: 150 min/sem; usa metade como piso) ──
export function isSedentaryWeek(c: TipContext): boolean {
  if (c.activeMinutesWeek == null) return false; // sem dado ≠ sedentário
  if (c.activeMinutesPrevWeek != null && c.activeMinutesPrevWeek >= 60) {
    return c.activeMinutesWeek <= c.activeMinutesPrevWeek * 0.7; // queda ≥ 30% vs semana própria
  }
  return c.activeMinutesWeek < 75;
}

/** Candidatos na ordem de prioridade — o primeiro COM dado e fora das 2 últimas dicas vence. */
function themeCandidates(c: TipContext): { theme: TipTheme; has: boolean }[] {
  return [
    { theme: 'melhora', has: c.improving.length > 0 },
    { theme: 'atencao', has: c.worsening.length > 0 },
    { theme: 'cardio', has: !!c.cardioLevel && c.cardioLevel !== 'baixo' },
    { theme: 'movimento', has: isSedentaryWeek(c) },
    { theme: 'exame-velho', has: c.stale || (c.daysSinceExam != null && c.daysSinceExam > 365) },
    { theme: 'rotina', has: true },
  ];
}

export function pickTipTheme(c: TipContext, recentThemes: string[]): TipTheme {
  const cands = themeCandidates(c).filter((x) => x.has);
  const blocked = recentThemes.slice(0, 2); // as 2 mais recentes
  const firstUnblocked = cands.find((x) => !blocked.includes(x.theme) && x.theme !== 'rotina');
  if (firstUnblocked) return firstUnblocked.theme;
  // Todo tema COM dado está bloqueado: repete o de maior prioridade — melhor que cair na
  // rotina genérica (o GLM evita repetição LITERAL via recentBodies no prompt).
  const top = cands.find((x) => x.theme !== 'rotina');
  return top?.theme ?? 'rotina';
}

// ── Prompt ──
export function buildTipPrompt(c: TipContext, theme: TipTheme, recentBodies: string[]): { system: string; user: string } {
  const system = 'Você é o Dr. Exame, assistente de saúde empático e prático do app Meus Exames. Escreva UMA dica curta (máx 2 frases, ~180 caracteres) sobre o tema informado, acionável ainda hoje. Cite UM dado concreto do contexto (valor/tendência de exame, minutos de atividade, tempo desde o último exame) de forma natural — o usuário deve pensar "essa dica é pra mim mesmo". Sem jargão médico, sem diagnóstico. PROIBIDO genéricas/óbvias ("beba água", "coma frutas", "durma bem"). NÃO repita o conteúdo das dicas anteriores listadas. Responda APENAS com a dica, sem aspas nem prefixo.';
  const lines: string[] = [`Paciente: ${c.firstName}. Tema da dica: ${THEME_LABEL[theme]}.`, 'Contexto real dele:'];
  if (c.score != null) lines.push(`- Score de saúde: ${c.score}/100`);
  if (c.daysSinceExam != null) lines.push(`- Último exame há ${c.daysSinceExam} dia(s)${c.stale ? ' (dados desatualizados p/ o score)' : ''}`);
  const mkLine = (m: TipMarker) =>
    `- ${m.name}: ${fmt(m.value)}${m.unit ? ` ${m.unit}` : ''}${m.prev != null ? ` (antes ${fmt(m.prev)})` : ''}${m.deltaPct != null ? `, variação ${m.deltaPct > 0 ? '+' : ''}${Math.round(m.deltaPct)}%` : ''}${m.refHigh != null ? `, referência até ${fmt(m.refHigh)}` : ''}`;
  if (theme === 'melhora') lines.push(...c.improving.slice(0, 2).map(mkLine));
  else if (theme === 'atencao') lines.push(...c.worsening.slice(0, 2).map(mkLine));
  else {
    if (c.improving.length) lines.push(mkLine(c.improving[0]) + ' (melhorando)');
    if (c.worsening.length) lines.push(mkLine(c.worsening[0]) + ' (piorando)');
  }
  if (c.cardioLevel) lines.push(`- Risco cardiometabólico: ${c.cardioLevel} (${c.cardioFactors} fator(es) de risco)`);
  if (c.activeMinutesWeek != null) {
    lines.push(`- Atividade (Health Connect): ${Math.round(c.activeMinutesWeek)} min ativos nos últimos 7 dias` +
      (c.activeMinutesPrevWeek != null ? ` (semana anterior: ${Math.round(c.activeMinutesPrevWeek)} min)` : '') +
      (c.stepsAvgDay != null ? `; média de ${c.stepsAvgDay} passos/dia` : '') +
      (c.restingHr != null ? `; FC repouso ${Math.round(c.restingHr)} bpm` : ''));
  }
  if (c.medications.length) lines.push(`- Medicações ativas: ${c.medications.join(', ')}`);
  switch (theme) {
    case 'melhora': lines.push('Tarefa: comemore de forma específica a melhora e dê 1 micro-dica para manter o ritmo.'); break;
    case 'atencao': lines.push('Tarefa: chame atenção para o marcador que piorou (sem alarmismo) e dê 1 ação concreta.'); break;
    case 'cardio': lines.push('Tarefa: dica prática que ataque diretamente o risco cardiometabólico dele.'); break;
    case 'movimento': lines.push('Tarefa: incentive movimento hoje citando os números de atividade dele.'); break;
    case 'exame-velho': lines.push('Tarefa: incentive repetir os exames citando o tempo desde o último.'); break;
    case 'rotina': lines.push(`Tarefa: dica de manutenção/prevenção ligada ao foco dele (${c.segment}).`); break;
  }
  if (recentBodies.length) {
    lines.push('Dicas já enviadas antes a este paciente (NÃO repita o ângulo/conteúdo):');
    recentBodies.slice(0, 4).forEach((b, i) => lines.push(`${i + 1}. ${b}`));
  }
  return { system, user: lines.join('\n') };
}

// ── Fallback curado POR TEMA (preenchido com os dados reais) ──
const FALLBACK_BY_SEGMENT: Record<Segment, string> = {
  colesterol: 'Seu colesterol já esteve alterado: corte gordura saturada (carnes vermelhas, frituras) e capriche na fibra — aveia e feijão ajudam o LDL a cair.',
  glicemia: 'Sua glicose merece atenção: evite açúcar em jejum, prefira integrais e caminhe 15 min após as refeições — o músculo consome a glicose.',
  pressao: 'Já teve pressão alta? Reduza o sal e embutidos, e meça a PA sempre no mesmo braço e horário. Anote pra ver a tendência.',
  anemia: 'Seus hematimetos já variaram: capriche em ferro (carne, feijão, folhas escuras) com vitamina C (laranja) pra absorver melhor.',
  tireoide: 'Você tem medicação de tireoide: tome em jejum, longe de cálcio/ferro, e revise a TSH na frequência que o médico pediu.',
  renal: 'Sua função renal pede cuidado: hidrate-se bem, evite excesso de anti-inflamatórios e de proteína animal.',
  rotina: 'Previnir é mais fácil que remediar: mantenha os exames de rotina em dia e leve cada dúvida ao seu médico.',
};

export function curatedFallback(c: TipContext, theme: TipTheme): string {
  const unit = (m: TipMarker) => (m.unit ? ` ${m.unit}` : '');
  switch (theme) {
    case 'melhora': {
      const m = c.improving[0];
      if (!m) break;
      return `Boa, ${c.firstName}: seu ${m.name} foi de ${fmt(m.prev)} pra ${fmt(m.value)}${unit(m)} — a tendência está indo bem. Mantém o que você tá fazendo e mostra essa evolução no próximo consultório.`;
    }
    case 'atencao': {
      const m = c.worsening[0];
      if (!m) break;
      return `Seu ${m.name} foi de ${fmt(m.prev)} pra ${fmt(m.value)}${unit(m)} — vale acompanhar essa tendência com seu médico. Rever a rotina agora pega cedo qualquer desvio.`;
    }
    case 'cardio':
      return `Seu risco cardiometabólico está ${c.cardioLevel} (${c.cardioFactors} fator(es)). Caminhadas de 30 min na semana e menos sal/açúcar atacam esses fatores direto — e o próximo exame mostra a diferença.`;
    case 'movimento': {
      const prev = c.activeMinutesPrevWeek != null ? ` (semana passada foram ${Math.round(c.activeMinutesPrevWeek)} min)` : '';
      return `Esta semana você acumulou ${Math.round(c.activeMinutesWeek ?? 0)} min de atividade${prev}. Uma caminhada de 20 min hoje já muda o placar da semana — e ajuda pressão, glicose e sono de uma vez.`;
    }
    case 'exame-velho':
      return `Seu último exame foi há ${c.daysSinceExam ?? '?'} dias — muita coisa muda no corpo em 1 ano. Repetir a bateria básica atualiza seu score e evita surpresa na próxima consulta.`;
    case 'rotina':
      return FALLBACK_BY_SEGMENT[c.segment];
  }
  return FALLBACK_BY_SEGMENT.rotina;
}
