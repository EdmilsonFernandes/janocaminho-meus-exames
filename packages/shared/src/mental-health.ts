// ── Rastreamento de saúde mental: PHQ-9 e GAD-7 (versão PT-BR validada, domínio público) ──
// Fonte ÚNICA de itens/pontuação/faixas — consumida pelo server (validação + total
// server-side) e pelo web (quiz + resultado + gráfico). Igual ao padrão do trendVerdict:
// manter UMA implementação aqui evita drift entre as duas pontas.
//
// PHQ-9: 9 itens, 0-3 cada, total 0-27 (depressão).
// GAD-7: 7 itens, 0-3 cada, total 0-21 (ansiedade).
// Janela de referência: NAS ÚLTIMAS 2 SEMANAS.

export type ScreeningType = 'phq9' | 'gad7';

/** Opções de resposta (idênticas nos dois instrumentos). value = pontos do item. */
export const SCREENING_OPTIONS = [
  { value: 0, label: 'Nunca' },
  { value: 1, label: 'Alguns dias' },
  { value: 2, label: 'Mais da metade dos dias' },
  { value: 3, label: 'Quase todos os dias' },
] as const;

export const PHQ9_ITEMS = [
  'Pouco interesse ou prazer em fazer as coisas',
  'Sentir-se para baixo, deprimido(a) ou sem perspectiva',
  'Dificuldade para pegar no sono ou manter o sono, ou dormir mais que o habitual',
  'Sentir-se cansado(a) ou com pouca energia',
  'Falta de apetite ou comendo demais',
  'Sentir-se mal consigo mesmo(a) — ou achar que é um fracasso ou que decepcionou sua família ou a si mesmo(a)',
  'Dificuldade para se concentrar em coisas, como ler o jornal ou ver televisão',
  'Movimentos ou fala tão lentos que outras pessoas notaram — ou, ao contrário, ficando mais agitado(a) que o habitual',
  'Pensou em se machucar de alguma forma, ou achou que seria melhor estar morto(a)',
] as const;

export const GAD7_ITEMS = [
  'Sentir-se nervoso(a), ansioso(a) ou tenso(a)',
  'Não conseguir parar de se preocupar ou controlar as preocupações',
  'Preocupar-se demais com coisas diferentes',
  'Dificuldade para relaxar',
  'Ficar tão agitado(a) que é difícil ficar parado(a)',
  'Ficar facilmente aborrecido(a) ou irritável',
  'Sentir medo como se algo horrível pudesse acontecer',
] as const;

export const screeningItems = (type: ScreeningType): readonly string[] =>
  type === 'phq9' ? PHQ9_ITEMS : GAD7_ITEMS;

export type ScreeningSeverity = 'minima' | 'leve' | 'moderada' | 'moderadamente_grave' | 'grave';

export interface SeverityBand {
  key: ScreeningSeverity;
  /** Label curto exibido junto ao score ("leve", "moderada"...). */
  label: string;
}

const PHQ9_BANDS: [number, SeverityBand][] = [
  [4, { key: 'minima', label: 'mínima' }],
  [9, { key: 'leve', label: 'leve' }],
  [14, { key: 'moderada', label: 'moderada' }],
  [19, { key: 'moderadamente_grave', label: 'moderadamente grave' }],
  [27, { key: 'grave', label: 'grave' }],
];

const GAD7_BANDS: [number, SeverityBand][] = [
  [4, { key: 'minima', label: 'mínima' }],
  [9, { key: 'leve', label: 'leve' }],
  [14, { key: 'moderada', label: 'moderada' }],
  [21, { key: 'grave', label: 'grave' }],
];

/** Faixa de severidade pelo total (limites inclusivos, versão validada). */
export const severityOf = (type: ScreeningType, total: number): SeverityBand => {
  const bands = type === 'phq9' ? PHQ9_BANDS : GAD7_BANDS;
  const t = Math.max(0, Math.round(total));
  for (const [max, band] of bands) {
    if (t <= max) return band;
  }
  return bands[bands.length - 1][1];
};

/** Valida o payload de answers: array com o nº exato de itens, cada um inteiro 0-3. */
export const validateScreeningAnswers = (type: ScreeningType, answers: unknown): answers is number[] => {
  if (!Array.isArray(answers)) return false;
  if (answers.length !== screeningItems(type).length) return false;
  return answers.every((a) => Number.isInteger(a) && (a as number) >= 0 && (a as number) <= 3);
};

/** Total server-side (a web nunca manda o score — o server recalcula). */
export const scoreScreening = (answers: number[]): number =>
  answers.reduce((s, a) => s + (Number.isInteger(a) && a >= 0 && a <= 3 ? a : 0), 0);

/** ÉTICO (PHQ-9, item 9): qualquer resposta > 0 no item do pensamento de autolesa
 *  dispara o card de crise (CVV 188) na UI. Item 9 = índice 8 do array. */
export const hasSuicidalIdeation = (answers: number[]): boolean =>
  Array.isArray(answers) && Number(answers[8]) > 0;

/** Máximo possível por instrumento (domínio do eixo Y do gráfico). */
export const maxScoreOf = (type: ScreeningType): number => (type === 'phq9' ? 27 : 21);
