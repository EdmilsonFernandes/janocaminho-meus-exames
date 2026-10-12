// Narração em áudio do resumo do exame (Feature "Dr. Exame fala" — por exame).
//
// O app NÃO gera MP3 server-side: a infra de voz é o TTS do CLIENTE (web speechSynthesis /
// TextToSpeech nativo pt-BR no APK — ver packages/web/src/utils/nativeDoc.ts). O papel deste
// util é construir o ROTEIRO da narração (30–60s) de forma DETERMINÍSTICA (sem custo de IA):
// o endpoint POST /api/exams/:id/narrate devolve o texto pronto + cobra 1 crédito de chat e
// cacheia 1 geração por exame. O front fala o texto com a mesma speakText do HealthSummary.

export interface NarrationItem {
  name: string;
  nameCanonical?: string | null;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  flag?: string | null;
  isAbnormal?: boolean | null;
}

export interface NarrationInput {
  patientName: string;
  examTitle: string;
  performedAt: Date | string | null;
  items: NarrationItem[];
  /** Score de saúde atual do paciente (0-100) — do buildCurrentHealthSummary. null = omite. */
  score?: number | null;
}

/** Glossário leigo p/ os analitos mais comuns (chave = nameCanonical, sem acento/maiúsculas).
 *  Fora da lista → só nome + direção (sem inventar explicação — anti-alucinação). */
const LAY: Record<string, string> = {
  GLICEMIA: 'o açúcar no sangue',
  GLICEMIA_JEJUM: 'o açúcar no sangue em jejum',
  HEMOGLOBINA: 'a proteína que transporta oxigênio no sangue',
  HEMATOCRITO: 'a proporção de células vermelhas no sangue',
  LEUCOCITOS: 'as células de defesa do sangue',
  PLAQUETAS: 'as células que ajudam na coagulação',
  COLESTEROL_TOTAL: 'o colesterol total',
  LDL: 'o colesterol ruim, o LDL',
  HDL: 'o colesterol bom, o HDL',
  TRIGLICERIDES: 'os triglicerídeos, um tipo de gordura no sangue',
  TSH: 'o hormônio que regula a tireoide',
  T4_LIVRE: 'o hormônio da tireoide',
  VITAMINA_D: 'a vitamina D',
  VITAMINA_B12: 'a vitamina B12',
  FERRITINA: 'a reserva de ferro do corpo',
  ACIDO_URICO: 'o ácido úrico',
  CREATININA: 'um marcador da função dos rins',
  UREIA: 'um marcador da função dos rins',
  PCR: 'a proteína C reativa, que sinaliza inflamação',
  ALT: 'uma enzima do fígado, a TGP',
  AST: 'uma enzima do fígado, a TGO',
  GAMA_GT: 'uma enzima do fígado',
  POTASSIO: 'o potássio',
  SODIO: 'o sódio',
  MAGNESIO: 'o magnésio',
};

/** Recomendação educativa (1 frase, não-diagnóstica) escolhida pela família do analito
 *  mais desviado. Determinística — nunca aconselha tratamento. */
function pickRecommendation(top: NarrationItem[]): string {
  const c = (top[0]?.nameCanonical ?? '').toUpperCase();
  if (/GLICEMIA|HBA1C/.test(c)) return 'Uma dica educativa: reduzir açúcares e carboidratos simples e caminhar com frequência ajuda no controle da glicose.';
  if (/COLESTEROL|LDL|TRIGLICERIDES|HDL/.test(c)) return 'Uma dica educativa: fibras, gorduras boas e atividade física regular ajudam no controle do colesterol.';
  if (/HEMOGLOBINA|FERRITINA|HEMATOCRITO/.test(c)) return 'Uma dica educativa: alimentos ricos em ferro, junto com frutas ricas em vitamina C, melhoram a absorção desse mineral.';
  if (/TSH|T4/.test(c)) return 'Uma dica educativa: a tireoide responde a estresse e sono irregular — rotina estável ajuda no acompanhamento.';
  if (/CREATININA|UREIA/.test(c)) return 'Uma dica educativa: boa hidratação e cuidado com anti-inflamatórios ajudam a proteger os rins.';
  if (/PCR|VCM|RDW|LEUCOCITOS/.test(c)) return 'Uma dica educativa: sono adequado e alimentação variada apoiam o sistema imunológico.';
  return 'Uma dica educativa: manter hidratação, alimentação equilibrada e sono de qualidade apoia seus resultados de exames.';
}

const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Ordena alterados: CRITICO primeiro, depois maior desvio relativo da faixa. */
function deviationRank(it: NarrationItem): number {
  if (String(it.flag ?? '').toUpperCase() === 'CRITICAL') return Number.MAX_SAFE_INTEGER;
  const v = it.valueNumeric ?? NaN;
  const lo = it.refLow ?? NaN;
  const hi = it.refHigh ?? NaN;
  if (!isFinite(v) || !isFinite(lo) || !isFinite(hi) || lo === hi) return 0;
  if (v > hi) return Math.abs((v - hi) / Math.abs(hi || 1));
  if (v < lo) return Math.abs((lo - v) / Math.abs(lo || 1));
  return 0;
}

/** Desvio de cada item em linguagem leiga ("14% acima do limite da faixa"). */
function describeDeviation(it: NarrationItem): string {
  const v = it.valueNumeric;
  const lo = it.refLow;
  const hi = it.refHigh;
  if (v == null || lo == null || hi == null) return 'fora da faixa de referência';
  if (v > hi) {
    const pct = Math.round((v - hi) / Math.abs(hi || 1) * 100);
    return pct > 0 ? `${pct}% acima do limite` : 'acima do limite';
  }
  if (v < lo) {
    const pct = Math.round((lo - v) / Math.abs(lo || 1) * 100);
    return pct > 0 ? `${pct}% abaixo do limite` : 'abaixo do limite';
  }
  return 'fora da faixa de referência';
}

const fmtVal = (it: NarrationItem): string =>
  it.valueText ?? (it.valueNumeric != null ? fmtNum(it.valueNumeric) : '—');

const fmtRef = (it: NarrationItem): string | null => {
  if (it.refLow != null && it.refHigh != null) return `${fmtNum(it.refLow)} a ${fmtNum(it.refHigh)}`;
  if (it.refHigh != null) return `até ${fmtNum(it.refHigh)}`;
  if (it.refLow != null) return `a partir de ${fmtNum(it.refLow)}`;
  return null;
};

/** Roteiro da narração (função PURA — testável sem DB/IO). ~450-700 chars ≈ 30–60s de fala. */
export function buildExamNarration(input: NarrationInput): string {
  const first = (input.patientName || '').trim().split(/\s+/)[0] || 'tudo bem';
  const date = input.performedAt
    ? new Date(input.performedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'data não informada';

  const abnormal = input.items
    .filter((i) => i.isAbnormal || ['HIGH', 'LOW', 'ABNORMAL', 'CRITICAL'].includes(String(i.flag ?? '').toUpperCase()))
    .sort((a, b) => deviationRank(b) - deviationRank(a));
  const top = abnormal.slice(0, 3);

  const parts: string[] = [];
  parts.push(`Olá, ${first}. Este é o resumo do seu exame de ${input.examTitle}, coletado em ${date}.`);

  if (abnormal.length === 0) {
    parts.push(`Boa notícia: todos os ${input.items.length} valores medidos estão dentro da faixa de referência.`);
  } else {
    parts.push(`No total, ${abnormal.length} ${abnormal.length === 1 ? 'valor está' : 'valores estão'} fora da faixa de referência.`);
    for (const it of top) {
      const lay = LAY[String(it.nameCanonical ?? '').toUpperCase()] ?? null;
      const ref = fmtRef(it);
      const dir = String(it.flag ?? '').toUpperCase() === 'LOW' ? 'abaixo' : 'acima';
      parts.push(
        `${it.name}${lay ? `, ${lay}` : ''}, em ${fmtVal(it)}${it.unit ? ` ${it.unit}` : ''}` +
        (ref ? `, está ${dir} da faixa de ${ref}` : ' está fora da faixa esperada') +
        ` — ${describeDeviation(it)}.`,
      );
    }
  }

  if (input.score != null) {
    parts.push(`Seu score de saúde atual é ${Math.round(input.score)} de 100.`);
  }

  parts.push(pickRecommendation(top));
  parts.push('Lembre-se: este áudio é educativo. Consulte seu médico para a interpretação completa.');

  return parts.join(' ');
}
