/**
 * Alimentação e exames — dicionário CURADO (14/11/26). Sem IA: cada linha foi escrita à mão a
 * partir de diretriz ou referência clínica, citada em `source`.
 *
 * Regras que este arquivo segue (e que test/food-guide.test.ts cobra):
 *  - diz a DIREÇÃO e a FORÇA da evidência; não promete número ("reduz X%"): as fontes
 *    divergem nos percentuais e quase todos vêm de resumo secundário;
 *  - não traz quantidade, porção, cardápio nem suplemento com dose. Plano alimentar individual
 *    é atividade privativa de nutricionista (Lei 8.234/1991); aqui é educação por exame;
 *  - quando a alimentação NÃO resolve, diz isso com todas as letras (`nao-resolve`);
 *  - toda entrada termina mandando para o médico o que é do médico.
 *
 * Precisa de revisão de nutricionista/médico antes de crescer. Para acrescentar um exame:
 * só com fonte primária (diretriz de sociedade médica ou manual clínico).
 */

export type FoodStrength = 'forte' | 'moderada' | 'limitada' | 'nao-resolve';
export type FoodWhen = 'alto' | 'baixo' | 'qualquer';

export interface FoodGuide {
  key: string;
  /** Como o exame aparece para o paciente. */
  label: string;
  match: RegExp;
  exclude?: RegExp;
  /** Para qual alteração a orientação vale. */
  when: FoodWhen;
  strength: FoodStrength;
  /** Uma frase: o que a ciência diz sobre alimentação e este exame. */
  summary: string;
  helps: string[];
  avoid: string[];
  /** "Só a alimentação resolve?" — resposta honesta. */
  dietAlone: string;
  source: string;
  /** Frase curta para a dica do push (só nas de evidência forte/moderada). */
  hint?: string;
}

const NO_DIET_SOURCE = 'Não há diretriz que indique alimentação como tratamento para esta alteração.';

export const FOOD_GUIDES: FoodGuide[] = [
  {
    key: 'ldl', label: 'Colesterol LDL', match: /\bLDL\b/, exclude: /VLDL|OXID|NAO.?HDL/, when: 'alto', strength: 'forte',
    summary: 'A alimentação tem efeito comprovado sobre o LDL, o colesterol "ruim".',
    helps: [
      'Trocar gordura saturada por insaturada: azeite, abacate, castanhas e peixe no lugar de carne gorda, manteiga e fritura',
      'Fibra solúvel todos os dias: aveia, feijão, lentilha, maçã e frutas cítricas',
      'Mais legumes, verduras e grãos integrais no prato',
    ],
    avoid: ['Carnes gordas e embutidos (linguiça, bacon, salame)', 'Manteiga, banha, creme de leite e queijos amarelos em excesso', 'Biscoitos, salgadinhos e frituras industrializadas'],
    dietAlone: 'Ajuda de verdade, mas tem limite: quando o LDL está muito acima da faixa, ou a pessoa já tem risco no coração, o médico costuma indicar remédio junto com a alimentação.',
    source: 'Diretrizes de dislipidemia da ESC/EAS (2019) e da AHA/ACC (2018).',
    hint: 'trocar gordura saturada por azeite, castanhas e peixe, e comer mais aveia e feijão, ajuda a baixar o LDL',
  },
  {
    key: 'colesterol-total', label: 'Colesterol total', match: /COLESTEROL TOTAL/, when: 'alto', strength: 'forte',
    summary: 'O colesterol total sobe principalmente por causa do LDL, que responde à alimentação.',
    helps: [
      'Trocar gordura saturada por insaturada: azeite, abacate, castanhas e peixe',
      'Fibra solúvel todos os dias: aveia, feijão, lentilha e frutas',
      'Mais legumes, verduras e grãos integrais',
    ],
    avoid: ['Carnes gordas e embutidos', 'Manteiga, creme de leite e frituras', 'Ultraprocessados'],
    dietAlone: 'O total sozinho diz pouco: o médico olha quanto dele é LDL e quanto é HDL antes de decidir se a alimentação basta.',
    source: 'Diretrizes de dislipidemia da ESC/EAS (2019) e da AHA/ACC (2018).',
    hint: 'menos gordura saturada e mais fibra costumam baixar o colesterol',
  },
  {
    key: 'triglicerideos', label: 'Triglicerídeos', match: /TRIGLICER/, when: 'alto', strength: 'forte',
    summary: 'É um dos exames que mais respondem à alimentação, ao álcool e ao peso.',
    helps: [
      'Cortar bebidas adoçadas: refrigerante, suco de caixinha e energético',
      'Reduzir doces, pão branco, massas e arroz branco em excesso',
      'Peixes como sardinha, atum e salmão',
      'Perder peso, quando há excesso: é o que mais mexe neste exame',
    ],
    avoid: ['Bebida alcoólica: mesmo pouca quantidade eleva os triglicerídeos', 'Açúcar e doces', 'Frituras e ultraprocessados'],
    dietAlone: 'Costuma responder bem. Mas, se estiver muito acima da faixa, procure o médico logo: nesse nível há risco para o pâncreas e a alimentação sozinha não basta.',
    source: 'Declaração científica da American Heart Association sobre triglicerídeos (2011) e National Lipid Association (2022).',
    hint: 'cortar bebida adoçada e álcool é o que mais baixa os triglicerídeos',
  },
  {
    key: 'hdl', label: 'Colesterol HDL', match: /\bHDL\b/, exclude: /NAO.?HDL/, when: 'baixo', strength: 'limitada',
    summary: 'A alimentação muda pouco o HDL; o que mais ajuda é movimento.',
    helps: ['Atividade física regular', 'Parar de fumar', 'Perder peso, quando há excesso', 'Preferir azeite, castanhas e peixe às gorduras saturadas'],
    avoid: ['Cigarro', 'Gordura trans (alguns biscoitos, recheios e margarinas)'],
    dietAlone: 'Não existe alimento que suba o HDL de forma confiável. O médico avalia o HDL junto com o restante do colesterol, não sozinho.',
    source: 'Diretriz de colesterol da AHA/ACC (2018).',
  },
  {
    key: 'glicose', label: 'Glicose', match: /GLICOSE|GLICEMIA/, exclude: /URIN|POS.?PRANDIAL|CURVA|TOLERANCIA/, when: 'alto', strength: 'forte',
    summary: 'Na fase de pré-diabetes, alimentação, peso e atividade física têm o efeito mais bem documentado da medicina preventiva.',
    helps: [
      'Perder peso, quando há excesso: é a medida com mais evidência',
      'Trocar pão branco, arroz branco e massas por versões integrais, em porções menores',
      'Mais fibra: feijão, legumes, verduras e frutas inteiras (não em suco)',
      'Atividade física na maior parte dos dias',
    ],
    avoid: ['Refrigerante, sucos adoçados e doces', 'Farinha refinada em excesso', 'Ultraprocessados'],
    dietAlone: 'No começo, muita gente traz a glicose de volta só com esses cuidados. Com valores bem acima da faixa, é o médico quem define se precisa de remédio.',
    source: 'Padrões de cuidado da American Diabetes Association e estudo Diabetes Prevention Program.',
    hint: 'menos bebida adoçada e farinha branca, mais fibra e movimento, é o que mais ajuda a glicose',
  },
  {
    key: 'hba1c', label: 'Hemoglobina glicada', match: /HEMOGLOBINA GLICADA|HBA1C|\bA1C\b/, when: 'alto', strength: 'forte',
    summary: 'A glicada mostra a média da glicose nos últimos meses, e responde aos mesmos cuidados da glicose.',
    helps: [
      'Perder peso, quando há excesso',
      'Trocar pão branco, arroz branco e massas por versões integrais, em porções menores',
      'Mais fibra: feijão, legumes, verduras e frutas inteiras',
      'Atividade física na maior parte dos dias',
    ],
    avoid: ['Refrigerante, sucos adoçados e doces', 'Farinha refinada em excesso', 'Ultraprocessados'],
    dietAlone: 'Ela demora meses para mudar, então o resultado dos cuidados aparece no exame seguinte. Com valores bem acima da faixa, é o médico quem define o tratamento.',
    source: 'Padrões de cuidado da American Diabetes Association e estudo Diabetes Prevention Program.',
    hint: 'menos açúcar e farinha branca, mais fibra e movimento, é o que mais ajuda a glicada',
  },
  {
    key: 'acido-urico', label: 'Ácido úrico', match: /ACIDO URICO|URATO/, exclude: /URIN/, when: 'alto', strength: 'limitada',
    summary: 'A alimentação mexe no ácido úrico, mas pouco: a própria diretriz classifica a evidência como baixa.',
    helps: ['Reduzir bebida alcoólica, principalmente cerveja', 'Menos refrigerante e bebidas adoçadas', 'Perder peso, quando há excesso'],
    avoid: ['Vísceras (fígado, rim), carne vermelha e frutos do mar em excesso', 'Cerveja e destilados', 'Bebidas com muito açúcar'],
    dietAlone: 'O efeito é modesto. Quem tem crise de gota costuma precisar de remédio, e isso é decisão do médico.',
    source: 'Diretriz de gota do American College of Rheumatology (2020).',
  },
  {
    key: 'figado', label: 'Enzimas do fígado (TGO, TGP, GGT)', match: /\bTGP\b|\bTGO\b|\bALT\b|\bAST\b|\bGGT\b|GAMA.?GLUTAMIL|ALANINA|ASPARTATO/, when: 'alto', strength: 'moderada',
    summary: 'Quando a causa é gordura no fígado, alimentação, peso e exercício são o tratamento principal.',
    helps: [
      'Perder peso, quando há excesso: é o que mais melhora a gordura no fígado',
      'Padrão mediterrâneo: azeite, peixe, legumes, feijões, frutas e castanhas',
      'Atividade física regular',
    ],
    avoid: ['Bebida alcoólica', 'Bebidas adoçadas e ultraprocessados'],
    dietAlone: 'Depende da causa. Essas enzimas também sobem por remédios, suplementos, anabolizantes em comprimido, hepatite e treino intenso, então o médico precisa investigar antes.',
    source: 'Diretrizes europeias de doença hepática gordurosa (EASL-EASD-EASO) e consenso global de 2025.',
    hint: 'reduzir álcool e bebida adoçada alivia o fígado, mas a causa precisa ser investigada',
  },
  {
    key: 'ferro-baixo', label: 'Ferritina e ferro', match: /FERRITINA|FERRO SERICO|\bFERRO\b/, exclude: /CAPACIDADE|SATURACAO|TRANSFERRINA/, when: 'baixo', strength: 'moderada',
    summary: 'A alimentação ajuda a absorver mais ferro, mas raramente repõe sozinha um estoque baixo.',
    helps: [
      'Carnes, frango e peixe: o ferro deles é o mais bem absorvido',
      'Feijão, lentilha, grão-de-bico e folhas verde-escuras',
      'Fruta cítrica ou outra fonte de vitamina C na mesma refeição, que aumenta a absorção',
    ],
    avoid: ['Café, chá preto e chá mate junto das refeições (reduzem a absorção)', 'Leite e derivados na mesma refeição do ferro'],
    dietAlone: 'Geralmente não. Com o ferro baixo, só a comida costuma não repor, e o médico precisa descobrir por que baixou: em adultos, a causa mais comum é perda de sangue.',
    source: 'Manual MSD, deficiência de ferro.',
    hint: 'ferro com vitamina C na mesma refeição, e café longe dela, melhora a absorção',
  },
  {
    key: 'anemia', label: 'Hemoglobina', match: /^HEMOGLOBINA$|HEMOGLOBINA(?!.*GLIC)/, exclude: /GLIC|A1C|CORPUSCULAR|HCM|CHCM/, when: 'baixo', strength: 'limitada',
    summary: 'Hemoglobina baixa (anemia) tem várias causas; falta de ferro é só uma delas.',
    helps: ['Manter alimentação variada, com carnes ou feijões e verduras verde-escuras'],
    avoid: ['Tomar ferro ou vitaminas por conta própria antes de saber a causa'],
    dietAlone: 'Não dá para saber sem investigar. Antes de mudar a alimentação, o médico precisa identificar o tipo de anemia.',
    source: 'Manual MSD, anemia e deficiência de ferro.',
  },
  {
    key: 'ferritina-alta', label: 'Ferritina', match: /FERRITINA/, when: 'alto', strength: 'nao-resolve',
    summary: 'Ferritina alta raramente é excesso de ferro na comida: costuma refletir inflamação, fígado ou álcool.',
    helps: [], avoid: ['Suplemento de ferro sem indicação médica'],
    dietAlone: 'Não. A causa precisa ser investigada pelo médico.',
    source: 'Manual MSD, deficiência e sobrecarga de ferro.',
  },
  {
    key: 'tsh', label: 'TSH', match: /\bTSH\b|TIREOESTIMULANTE/, when: 'qualquer', strength: 'nao-resolve',
    summary: 'Alterações da tireoide não se corrigem com alimentação.',
    helps: [], avoid: ['Suplementos "para tireoide" por conta própria'],
    dietAlone: 'Não. A avaliação e o tratamento são médicos.', source: NO_DIET_SOURCE,
  },
  {
    key: 'psa', label: 'PSA', match: /^PSA\b|ANTIGENO PROSTATICO/, exclude: /RELACAO/, when: 'alto', strength: 'nao-resolve',
    summary: 'Não há alimento com efeito comprovado para baixar o PSA.',
    helps: [], avoid: [],
    dietAlone: 'Não. PSA alterado precisa de avaliação do urologista.', source: NO_DIET_SOURCE,
  },
  {
    key: 'hematocrito', label: 'Hematócrito', match: /HEMATOCRITO/, when: 'alto', strength: 'nao-resolve',
    summary: 'Hematócrito alto não se corrige com alimentação.',
    helps: [], avoid: [],
    dietAlone: 'Não. Em quem usa testosterona, é um dos exames que o médico acompanha de perto.', source: NO_DIET_SOURCE,
  },
  {
    key: 'creatinina', label: 'Creatinina', match: /CREATININA/, exclude: /URIN|CLEARANCE|DEPURACAO/, when: 'alto', strength: 'nao-resolve',
    summary: 'Creatinina alta é sinal para avaliar os rins, não para mudar a alimentação por conta própria.',
    helps: [], avoid: ['Cortar ou aumentar proteína sem orientação'],
    dietAlone: 'Não. Massa muscular e suplemento de creatina também elevam o resultado; quem interpreta é o médico.', source: NO_DIET_SOURCE,
  },
  {
    key: 'potassio', label: 'Potássio', match: /POTASSIO/, exclude: /URIN/, when: 'qualquer', strength: 'nao-resolve',
    summary: 'Potássio fora da faixa precisa de avaliação médica rápida.',
    helps: [], avoid: ['Mudar a alimentação ou tomar suplemento por conta própria'],
    dietAlone: 'Não. Procure o médico antes de qualquer mudança.', source: NO_DIET_SOURCE,
  },
];

export const normalizeExamName = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Para que lado o resultado saiu da faixa do laudo (null = na faixa ou sem faixa). */
export function directionOf(r: { value: number | null; refLow: number | null; refHigh: number | null; flag?: string | null }): 'alto' | 'baixo' | null {
  if (r.value == null || !Number.isFinite(r.value)) return null;
  if (r.refHigh != null && r.value > r.refHigh) return 'alto';
  if (r.refLow != null && r.value < r.refLow) return 'baixo';
  if (r.refLow == null && r.refHigh == null) {
    const f = String(r.flag ?? '').toUpperCase();
    if (/HIGH|ALTO/.test(f)) return 'alto';
    if (/LOW|BAIXO/.test(f)) return 'baixo';
  }
  return null;
}

export function findFoodGuide(name: string, when: 'alto' | 'baixo'): FoodGuide | null {
  const n = normalizeExamName(name);
  return FOOD_GUIDES.find((g) => (g.when === when || g.when === 'qualquer') && g.match.test(n) && !(g.exclude && g.exclude.test(n))) ?? null;
}

export type PublicFoodGuide = Omit<FoodGuide, 'match' | 'exclude' | 'hint'>;
export const toPublicGuide = ({ match: _m, exclude: _e, hint: _h, ...rest }: FoodGuide): PublicFoodGuide => rest;

const STRENGTH_ORDER: Record<FoodStrength, number> = { forte: 0, moderada: 1, limitada: 2, 'nao-resolve': 3 };

export interface FoodMatch {
  nameCanonical: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  date: string | null;
  direction: 'alto' | 'baixo';
  guide: PublicFoodGuide;
}

/** Cruza os resultados mais recentes do paciente com o dicionário (1 orientação por entrada). */
export function matchFoodGuides(latest: Array<{ nameCanonical: string; value: number | null; unit: string | null; refLow: number | null; refHigh: number | null; flag?: string | null; date: Date | string | null }>): FoodMatch[] {
  const out: FoodMatch[] = [];
  const used = new Set<string>();
  for (const r of latest) {
    const direction = directionOf(r);
    if (!direction || r.value == null) continue;
    const guide = findFoodGuide(r.nameCanonical, direction);
    if (!guide || used.has(guide.key)) continue;
    used.add(guide.key);
    out.push({ nameCanonical: r.nameCanonical, value: r.value, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh, date: r.date ? new Date(r.date).toISOString() : null, direction, guide: toPublicGuide(guide) });
  }
  return out.sort((a, b) => STRENGTH_ORDER[a.guide.strength] - STRENGTH_ORDER[b.guide.strength]);
}

/** Frase de alimentação para a dica (push). Só quando a evidência é forte ou moderada. */
export function foodHintFor(name: string, direction: 'alto' | 'baixo' | null): string | null {
  if (!direction) return null;
  const g = findFoodGuide(name, direction);
  return g && g.hint && (g.strength === 'forte' || g.strength === 'moderada') ? g.hint : null;
}
