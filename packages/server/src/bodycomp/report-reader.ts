/**
 * Leitor de LAUDO de bioimpedância (PDF ou foto) de qualquer marca — Omron, Tanita, InBody,
 * relatório de nutricionista. Mesmo caminho dos exames: pdftotext (ou OCR tesseract) → TEXTO
 * → GLM. NUNCA visão (o relay alucina com imagem).
 *
 * Como sabe que é bioimpedância e não exame de sangue: o envio sai da tela de Composição
 * corporal E o texto precisa ter sinais próprios de bioimpedância (`looksLikeBodyComposition`).
 * Sem sinal → recusa antes de gastar IA.
 *
 * Salvaguardas (erro aqui é dado de saúde errado):
 *  1. Todo número devolvido pela IA precisa ESTAR ESCRITO no texto do laudo; o que não está
 *     é descartado (a IA não pode "completar" medida).
 *  2. Faixa plausível por campo; fora dela é descartado.
 *  3. Se peso, gordura (kg) e % de gordura vieram juntos, precisam fechar entre si; se não
 *     fecham, recusa tudo (a leitura misturou colunas).
 *  4. Sempre volta como PRÉVIA: o usuário confere com o papel antes de gravar.
 */

/** Maiúsculas e sem acento — o OCR e os laudos variam muito na acentuação. */
export const normalizeText = (text: string) =>
  String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const BODYCOMP_SIGNALS = [
  'BIOIMPEDANCIA', 'COMPOSICAO CORPORAL', 'GORDURA CORPORAL', 'PERCENTUAL DE GORDURA', '% DE GORDURA',
  'MASSA DE GORDURA', 'MASSA GORDA', 'MASSA MUSCULAR', 'MUSCULO ESQUELETICO', 'MASSA MAGRA',
  'MASSA LIVRE DE GORDURA', 'AGUA CORPORAL', 'GORDURA VISCERAL', 'TAXA METABOLICA BASAL',
  'METABOLISMO BASAL', 'INBODY', 'TANITA', 'OMRON', 'PGC', 'BODY FAT', 'SKELETAL MUSCLE',
];

/** Laudo de sangue costuma ter isto — ajuda a recusar quando alguém manda o exame errado. */
const LAB_SIGNALS = ['HEMOGRAMA', 'LEUCOCITOS', 'PLAQUETAS', 'GLICOSE', 'COLESTEROL', 'CREATININA', 'MG/DL', 'G/DL'];

export function looksLikeBodyComposition(text: string): boolean {
  const t = normalizeText(text);
  const body = BODYCOMP_SIGNALS.filter((s) => t.includes(s)).length;
  const lab = LAB_SIGNALS.filter((s) => t.includes(s)).length;
  return body >= 2 && /\bPESO\b|\bWEIGHT\b/.test(t) && body > lab;
}

export const REPORT_FIELDS = {
  weightKg: [20, 300],
  bodyFatPct: [2, 75],
  fatMassKg: [1, 200],
  skeletalMuscleKg: [5, 80],
  fatFreeMassKg: [10, 150],
  bodyWaterL: [10, 90],
  proteinKg: [2, 30],
  mineralKg: [1, 8],
  bmi: [10, 80],
  bmrKcal: [600, 4500],
  waistHipRatio: [0.55, 1.5],
  visceralFatLevel: [1, 59],
  heightCm: [100, 230],
} as const;

export type ReportField = keyof typeof REPORT_FIELDS;

export const REPORT_INSTRUCTIONS = `Você lê LAUDOS DE BIOIMPEDÂNCIA (composição corporal) brasileiros, de qualquer aparelho (InBody, Tanita, Omron, relatório de nutricionista), a partir do TEXTO extraído do documento.

REGRAS CRÍTICAS (ANTI-ALUCINAÇÃO):
- Devolva APENAS valores ESCRITOS no texto. Nunca calcule, estime ou complete um campo que não aparece.
- Use o valor MEDIDO do paciente — NUNCA o limite de uma faixa de referência, a meta ("ideal", "alvo", "controle") ou o valor de uma avaliação anterior.
- Se houver várias avaliações no documento, use a MAIS RECENTE e informe a data dela.
- Número com vírgula vira ponto (72,5 → 72.5). Sem unidade no número.
- Campo ausente ou ilegível → null.

CAMPOS (todos opcionais, null quando não constar):
- measuredAt: data da avaliação, "AAAA-MM-DD"
- deviceBrand: marca do aparelho (ex.: "InBody", "Tanita", "Omron"); deviceModel: modelo (ex.: "270", "BC-601")
- weightKg (peso, kg), heightCm (altura, cm)
- bodyFatPct (% de gordura corporal / PGC), fatMassKg (massa de gordura, kg)
- skeletalMuscleKg (massa muscular ESQUELÉTICA, kg — se o laudo só tiver "massa muscular" total, use null aqui)
- fatFreeMassKg (massa livre de gordura / massa magra, kg)
- bodyWaterL (água corporal total, L), proteinKg (kg), mineralKg (kg)
- bmi (IMC), bmrKcal (taxa metabólica basal, kcal), waistHipRatio (relação cintura-quadril)
- visceralFatLevel (nível/área de gordura visceral, como impresso)

Formato: {"measuredAt":...,"deviceBrand":...,"deviceModel":...,"weightKg":...,"heightCm":...,"bodyFatPct":...,"fatMassKg":...,"skeletalMuscleKg":...,"fatFreeMassKg":...,"bodyWaterL":...,"proteinKg":...,"mineralKg":...,"bmi":...,"bmrKcal":...,"waistHipRatio":...,"visceralFatLevel":...}`;

/** O número aparece escrito no texto? Aceita vírgula ou ponto e zeros à direita ("72,50" = 72.5). */
export function numberInText(value: number, normalizedText: string): boolean {
  const variants = new Set<string>();
  for (const decimals of [0, 1, 2]) {
    const fixed = value.toFixed(decimals);
    if (Number(fixed) !== value) continue;
    variants.add(fixed);
    variants.add(fixed.replace('.', ','));
  }
  if (Number.isInteger(value) && value >= 1000) variants.add(value.toLocaleString('pt-BR')); // 1.768
  for (const v of variants) {
    // Fronteira numérica: "72,5" não pode casar dentro de "172,55".
    const re = new RegExp(`(^|[^0-9.,])${v.replace(/[.,]/g, (c) => `\\${c}`)}(?![0-9]|[.,][0-9])`);
    if (re.test(normalizedText)) return true;
  }
  return false;
}

export interface ReportReading {
  measuredAt: Date | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  values: Partial<Record<ReportField, number>>;
  /** Campos que a IA devolveu mas foram descartados (não estavam no texto ou fora de faixa). */
  dropped: string[];
}

export type ReportCheck =
  | { ok: true; reading: ReportReading }
  | { ok: false; code: 'NO_WEIGHT' | 'INCONSISTENT' | 'TOO_LITTLE'; message: string };

const cleanLabel = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim().slice(0, 40) : '';
  return s && !/^null$/i.test(s) ? s : null;
};

/** Aplica as salvaguardas sobre o JSON que a IA devolveu. Pura (testável sem IA). */
export function checkReportReading(raw: any, text: string, now = new Date()): ReportCheck {
  const t = normalizeText(text);
  const values: Partial<Record<ReportField, number>> = {};
  const dropped: string[] = [];
  for (const key of Object.keys(REPORT_FIELDS) as ReportField[]) {
    const rawValue = raw?.[key];
    if (rawValue == null || rawValue === '') continue;
    const v = typeof rawValue === 'string' ? Number(rawValue.replace(',', '.')) : Number(rawValue);
    const [min, max] = REPORT_FIELDS[key];
    if (!Number.isFinite(v) || v < min || v > max || !numberInText(v, t)) { dropped.push(key); continue; }
    values[key] = v;
  }

  if (values.weightKg == null) {
    return { ok: false, code: 'NO_WEIGHT', message: 'Não encontrei o peso neste laudo. Confira se é o resultado da bioimpedância ou digite os valores.' };
  }
  const w = values.weightKg;
  if (values.fatMassKg != null && values.bodyFatPct != null && Math.abs((values.fatMassKg / w) * 100 - values.bodyFatPct) > 1.5) {
    return { ok: false, code: 'INCONSISTENT', message: 'Li o laudo, mas peso, gordura em kg e % de gordura não fecham entre si. Para não gravar nada errado, digite os valores.' };
  }
  if (values.fatMassKg != null && values.fatFreeMassKg != null && Math.abs(w - values.fatMassKg - values.fatFreeMassKg) > 1) {
    return { ok: false, code: 'INCONSISTENT', message: 'Li o laudo, mas peso, gordura e massa magra não fecham entre si. Para não gravar nada errado, digite os valores.' };
  }
  if (values.skeletalMuscleKg != null && values.skeletalMuscleKg >= w) {
    dropped.push('skeletalMuscleKg');
    delete values.skeletalMuscleKg;
  }
  if (values.bodyFatPct == null && values.fatMassKg == null && values.skeletalMuscleKg == null) {
    return { ok: false, code: 'TOO_LITTLE', message: 'Encontrei o peso, mas nenhuma medida de gordura ou músculo. Digite os valores que constam no laudo.' };
  }

  let measuredAt: Date | null = null;
  if (typeof raw?.measuredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.measuredAt)) {
    const d = new Date(`${raw.measuredAt}T12:00:00-03:00`);
    const [y, m, day] = raw.measuredAt.split('-');
    // A data também precisa estar no texto (dd/mm/aaaa, dd.mm.aaaa ou aaaa-mm-dd).
    const written = [`${day}/${m}/${y}`, `${day}.${m}.${y}`, `${day}-${m}-${y}`, `${y}-${m}-${day}`, `${y}/${m}/${day}`, `${day}/${m}/${y.slice(2)}`].some((s) => t.includes(s));
    if (written && !Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getTime() <= now.getTime() + 48 * 3600 * 1000) measuredAt = d;
    else dropped.push('measuredAt');
  }

  return {
    ok: true,
    reading: { measuredAt, deviceBrand: cleanLabel(raw?.deviceBrand), deviceModel: cleanLabel(raw?.deviceModel), values, dropped },
  };
}
