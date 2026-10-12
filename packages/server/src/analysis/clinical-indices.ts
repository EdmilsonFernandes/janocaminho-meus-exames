/**
 * clinical-indices.ts — Índices clínicos CALCULADOS (determinísticos, zero IA).
 *
 * Mesma filosofia do health-state/derived-markers: matemática pura sobre valores JÁ
 * extraídos. Cada índice só aparece quando TODOS os marcadores exigidos existem —
 * sem dado não se calcula (nem se adivinha). Bandas são EDUCATIVAS (não diagnóstico);
 * cada índice cita a fonte.
 *
 * Unidades: padrão laboratorial BR (lipídios/glicemia em mg/dL; enzimas U/L;
 * plaquetas 10³/µL = 10⁹/L; TSH mIU/L; T4L pmol/L). Conversão explícita só onde a
 * fórmula da literatura exige outra base (AIP usa mmol/L; FAI usa nmol/L).
 *
 * Índices da literatura que ficaram FORA (honestidade > contagem):
 *  - PAF (Plasma Arginine): nenhum laboratório BR do pipeline reporta arginina
 *    plasmática — `requires` nunca casaria; índice morto não entra.
 *  - RDR/RDW-SD: o canonical 'RDW' colapsa RDW-CV (%) e RDW-SD (fL) na MESMA série
 *    (fuzzy match); banda única seria desonesta. RDW já aparece como marcador normal.
 *  - SPINA-GT: fórmula com constantes (αT/βT/DT) que não conseguimos verificar
 *    contra a fonte primária com confiança — nada de fórmula médica de memória.
 */
import type { MarkerState } from './health-state';
import { egfr as egfrCalc, homaIr } from './derived-markers';

// ───────────────────────────── tipos ─────────────────────────────

export type IndexLevel = 'bom' | 'atencao' | 'alterado';

/** Contexto do paciente p/ índices que dependem de idade/sexo (FIB-4, eGFR, LH/FSH, FAI). */
export interface IndexContext {
  ageYears?: number | null;
  sex?: 'male' | 'female' | null;
  /** Unidade REAL de cada marcador (canonical → unit) — p/ conversão quando a fórmula
   *  exige outra base (FAI quer T em nmol/L; labs BR reportam ng/dL). */
  units?: Record<string, string>;
}

/** Definição de um índice (registro declarativo — cada um com fonte citada). */
export interface ClinicalIndex {
  key: string;
  name: string;
  /** Fórmula sobre os marcadores canônicos (mg/dL etc. — ver header). Null = não calculável. */
  formula: (m: Record<string, number>, ctx: IndexContext) => number | null;
  unit: string;
  /** Banda educativa. ctx entra quando a interpretação é sexo/idade-dependente. */
  interpretation: (value: number, ctx: IndexContext) => { level: IndexLevel; text: string };
  /** Citação da literatura/diretriz. */
  source: string;
  /** Marcadores canônicos necessários — TODOS devem existir p/ o índice aparecer. */
  requires: string[];
  /** Descrição da fórmula p/ tooltip (o que o usuário vê). */
  howTo: string;
  /** Casas decimais na exibição. */
  decimals?: number;
}

/** Índice calculado — o que vai pro response. */
export interface ClinicalIndexResult {
  key: string;
  name: string;
  value: number;
  unit: string;
  level: IndexLevel;
  interpretation: string;
  source: string;
  howTo: string;
}

// helpers de arredondamento
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Nível por faixa: retorna level+texto conforme posição na banda [bom, atencao]. */
const band = (v: number, bomMax: number, atencaoMax: number, txtBom: string, txtAtencao: string, txtAlterado: string) =>
  v < bomMax
    ? { level: 'bom' as const, text: txtBom }
    : v <= atencaoMax
      ? { level: 'atencao' as const, text: txtAtencao }
      : { level: 'alterado' as const, text: txtAlterado };

// ───────────────────────────── registro ─────────────────────────────

export const CLINICAL_INDICES: ClinicalIndex[] = [
  {
    key: 'castelli_i',
    name: 'Risco de Castelli I',
    formula: (m) => (m.HDL > 0 ? r1(m.COLESTEROL_TOTAL / m.HDL) : null),
    unit: 'razão',
    interpretation: (v) =>
      band(v, 4.5, 5.5,
        'Proporção colesterol/HDL em zona favorável',
        'Proporção em zona intermediária — vale acompanhar',
        'Proporção elevada — associada a maior risco cardiovascular'),
    source: 'Castelli WP et al., Circulation 1986 (LRC-CPPT) — razão colesterol total/HDL',
    requires: ['COLESTEROL_TOTAL', 'HDL'],
    howTo: 'Colesterol total ÷ HDL',
    decimals: 1,
  },
  {
    key: 'castelli_ii',
    name: 'Risco de Castelli II',
    formula: (m) => (m.HDL > 0 ? r1(m.LDL / m.HDL) : null),
    unit: 'razão',
    interpretation: (v) =>
      band(v, 3.0, 3.5,
        'Proporção LDL/HDL em zona favorável',
        'Proporção em zona intermediária — vale acompanhar',
        'Proporção elevada — associada a maior risco cardiovascular'),
    source: 'Grundy SM et al., NHLBI/ATP III 2001 — razão LDL/HDL como preditor',
    requires: ['LDL', 'HDL'],
    howTo: 'LDL ÷ HDL',
    decimals: 1,
  },
  {
    key: 'tg_hdl',
    name: 'Razão Triglicerídeos/HDL',
    formula: (m) => (m.HDL > 0 ? r1(m.TRIGLICERIDES / m.HDL) : null),
    unit: 'razão',
    interpretation: (v) =>
      band(v, 2.0, 3.8,
        'Razão associada a boa sensibilidade à insulina',
        'Razão em zona de atenção — pode associar-se a resistência insulínica',
        'Razão elevada — associada a resistência insulínica e risco cardiometabólico'),
    source: 'Gaziano JM et al., Circulation 1997; Reaven GM — TG/HDL como marcador de resistência insulínica',
    requires: ['TRIGLICERIDES', 'HDL'],
    howTo: 'Triglicerídeos ÷ HDL (mg/dL)',
    decimals: 1,
  },
  {
    key: 'aip',
    name: 'AIP — Índice Aterogênico do Plasma',
    // Dobiásová usa TG e HDL em mmol/L: log10(TG/HDL). Labs BR reportam mg/dL → converte
    // (TG ÷ 88,57 · HDL ÷ 38,67) ANTES do log — usar mg/dL direto mudaria os cortes.
    formula: (m) => (m.HDL > 0 ? r2(Math.log10((m.TRIGLICERIDES / 88.57) / (m.HDL / 38.67))) : null),
    unit: 'log',
    interpretation: (v) =>
      band(v, 0.11, 0.21,
        'Índice aterogênico em zona baixa',
        'Índice em zona intermediária',
        'Índice elevado — associado a maior risco cardiovascular'),
    source: 'Dobiásová M & Frohlich J, Clinical Chemistry 2001 — AIP = log₁₀(TG/HDL) em mmol/L',
    requires: ['TRIGLICERIDES', 'HDL'],
    howTo: 'log₁₀(Triglicerídeos ÷ HDL), convertidos p/ mmol/L',
    decimals: 2,
  },
  {
    key: 'homa_ir',
    name: 'HOMA-IR',
    formula: (m) => homaIr(m.GLICEMIA, m.INSULINA),
    unit: 'índice',
    interpretation: (v) =>
      band(v, 2.5, 5.0,
        'Sem sinal de resistência insulínica pelo HOMA-IR',
        'Valor intermediário — vale conversar com seu médico',
        'Valor elevado — associado a resistência insulínica'),
    source: 'Matthews DR et al., Diabetologia 1985 — HOMA-IR = (glicemia × insulina) / 405 (jejum)',
    requires: ['GLICEMIA', 'INSULINA'],
    howTo: '(Glicemia × Insulina de jejum) ÷ 405',
    decimals: 2,
  },
  {
    key: 'tyg',
    name: 'Índice TYG (Triglicéricos-Glicose)',
    // Simental-Mendía: ln[TG(mg/dL) × glicemia(mg/dL) / 2]. Com valores BR típicos o
    // resultado fica ~8,0-8,9 — cortes de estudos: ~8,5 (atenção) e ~8,8 (elevado).
    // (As faixas "4,5-5,0" às vezes citadas NÃO correspondem a esta fórmula em mg/dL.)
    formula: (m) => (m.TRIGLICERIDES > 0 && m.GLICEMIA > 0 ? r2(Math.log((m.TRIGLICERIDES * m.GLICEMIA) / 2)) : null),
    unit: 'índice',
    interpretation: (v) =>
      band(v, 8.5, 8.8,
        'Índice em zona habitualmente associada a sensibilidade insulínica preservada',
        'Índice em zona de atenção (cortes variam entre estudos)',
        'Índice elevado — associado a resistência insulínica em estudos observacionais'),
    source: 'Simental-Mendía LE et al., Endocrine Reviews/ Metabolism 2008 — TYG = ln(TG × glicemia / 2)',
    requires: ['TRIGLICERIDES', 'GLICEMIA'],
    howTo: 'ln(Triglicerídeos × Glicemia ÷ 2)',
    decimals: 2,
  },
  {
    key: 'fib4',
    name: 'FIB-4 (fibrose hepática)',
    formula: (m, ctx) => {
      if (!ctx.ageYears || ctx.ageYears <= 0) return null;
      if (m.TGP <= 0 || m.PLAQUETAS <= 0) return null;
      return r2((ctx.ageYears * m.TGO) / (m.PLAQUETAS * Math.sqrt(m.TGP)));
    },
    unit: 'índice',
    interpretation: (v) =>
      v < 1.45
        ? { level: 'bom', text: 'Baixa probabilidade de fibrose hepática avançada (zona de baixo risco)' }
        : v <= 3.25
          ? { level: 'atencao', text: 'Zona intermediária — exames adicionais podem ser avaliados pelo médico' }
          : { level: 'alterado', text: 'Zona de alto risco — vale discussão médica' },
    source: 'Sterling RK et al., Hepatology 2006 — FIB-4 = (idade × TGO) / (plaquetas × √TGP)',
    requires: ['TGO', 'TGP', 'PLAQUETAS'],
    howTo: '(Idade × TGO) ÷ (Plaquetas × √TGP)',
    decimals: 2,
  },
  {
    key: 'egfr',
    name: 'eGFR — Filtração Glomerular',
    formula: (m, ctx) => egfrCalc(m.CREATININA, ctx.ageYears ?? null, ctx.sex ?? null),
    unit: 'mL/min/1,73m²',
    interpretation: (v) =>
      v >= 60
        ? { level: 'bom', text: 'Filtração preservada (≥60)' }
        : v >= 30
          ? { level: 'atencao', text: 'Redução da filtração (30-59) — acompanhamento médico recomendado' }
          : { level: 'alterado', text: 'Filtração muito reduzida (<30) — requer avaliação médica' },
    source: 'CKD-EPI 2021 (race-free) — Inker LA et al., NEJM 2021 (KDIGO)',
    requires: ['CREATININA'],
    howTo: 'Fórmula CKD-EPI 2021 com creatinina, idade e sexo',
  },
  {
    key: 'non_hdl',
    name: 'Colesterol não-HDL',
    formula: (m) => r1(m.COLESTEROL_TOTAL - m.HDL),
    unit: 'mg/dL',
    interpretation: (v) =>
      band(v, 130, 160,
        'Abaixo da meta da diretriz (<130 mg/dL)',
        'Entre 130-160 — vale acompanhar (meta depende do seu risco)',
        'Acima de 160 — associado a risco aumentado'),
    source: 'SBC/SBI 2021 — Diretriz Brasileira de Dislipidemias (metas de não-HDL)',
    requires: ['COLESTEROL_TOTAL', 'HDL'],
    howTo: 'Colesterol total − HDL',
    decimals: 0,
  },
  {
    key: 'lh_fsh',
    name: 'Razão LH/FSH',
    formula: (m) => (m.FSH > 0 ? r2(m.LH / m.FSH) : null),
    unit: 'razão',
    interpretation: (v, ctx) => {
      // Mulher em idade reprodutiva: razão > 2,0-2,5 é um dos achados clássicos (não
      // exclusivo) da SOP — nunca diagnóstico isolado. Pós-menopausa e homens: a razão
      // é interpretada em contexto clínico — fica informativa, sem alarme.
      if (ctx.sex === 'female' && ctx.ageYears != null && ctx.ageYears >= 18 && ctx.ageYears < 45 && v > 2) {
        return { level: 'atencao', text: 'Razão acima de 2 — pode associar-se a quadros como SOP; avaliar com médico (nunca define diagnóstico sozinha)' };
      }
      return { level: 'bom', text: 'Interpretação depende de fase do ciclo/idade/contexto clínico — discuta com seu médico' };
    },
    source: 'Rotterdam ESHRE/ASRM 2003 (contexto SOP) — razão LH/FSH como achado complementar',
    requires: ['LH', 'FSH'],
    howTo: 'LH ÷ FSH',
    decimals: 2,
  },
  {
    key: 'fai',
    name: 'FAI — Índice de Androgênio Livre',
    // FAI = Testosterona (nmol/L) ÷ SHBG (nmol/L) × 100. Labs BR: T total em ng/dL e
    // SHBG em nmol/L. Converte T pela UNIDADE REAL do item; sem unidade, o padrão BR é
    // ng/dL (só valor < 3 — faixa exclusiva de nmol/L em ambos os sexos — fica direto).
    formula: (m, ctx) => {
      if (m.SHBG <= 0) return null;
      const unit = (ctx.units?.TESTOSTERONA_TOTAL ?? '').toLowerCase();
      let t = m.TESTOSTERONA_TOTAL;
      if (unit.includes('ng') || (!unit && t >= 3)) t = t * 0.0347; // ng/dL → nmol/L
      return r1((t / m.SHBG) * 100);
    },
    unit: 'índice',
    interpretation: (v, ctx) => {
      if (ctx.sex === 'female') {
        return v <= 6
          ? { level: 'bom', text: 'Dentro da faixa habitual p/ mulheres' }
          : { level: 'atencao', text: 'Elevado p/ mulheres — pode associar-se a hiperandrogenismo (avaliar com médico)' };
      }
      if (ctx.sex === 'male') {
        if (v < 20) return { level: 'atencao', text: 'Baixo p/ homens — pode associar-se a hipoandrogenismo; contexto médico' };
        if (v > 120) return { level: 'atencao', text: 'Elevado p/ homens — contexto médico recomendado' };
      }
      return { level: 'bom', text: 'Índice informativo — a interpretação depende de sexo, idade e quadro clínico' };
    },
    source: 'FAI (Free Androgen Index) — Vermeulen A et al., J Clin Endocrinol Metab 1999',
    requires: ['TESTOSTERONA_TOTAL', 'SHBG'],
    howTo: '(Testosterona total em nmol/L ÷ SHBG) × 100',
    decimals: 1,
  },
];

// ───────────────────────────── computação ─────────────────────────────

/**
 * Calcula TODOS os índices cujos marcadores exigidos estão disponíveis (valor numérico
 * válido). Só matemática — zero IA. Índice sem insumo completo NÃO aparece (honestidade:
 * ausência de dado nunca vira "bom").
 */
export function computeClinicalIndices(
  markers: MarkerState[],
  ctx: IndexContext = {},
): ClinicalIndexResult[] {
  // Mapa canonical → último valor numérico (MarkerState já traz o latest do marcador)
  // + unidade real de cada um (FAI precisa p/ converter ng/dL → nmol/L).
  const m: Record<string, number> = {};
  const units: Record<string, string> = {};
  for (const mk of markers) {
    const v = mk.latest.valueNumeric;
    if (v != null && Number.isFinite(v)) {
      m[mk.nameCanonical] = v;
      if (mk.unit) units[mk.nameCanonical] = mk.unit;
    }
  }
  const ctxFull: IndexContext = { ...ctx, units };
  const out: ClinicalIndexResult[] = [];
  for (const idx of CLINICAL_INDICES) {
    if (!idx.requires.every((k) => typeof m[k] === 'number')) continue;
    const value = idx.formula(m, ctxFull);
    if (value == null || !Number.isFinite(value)) continue;
    const interp = idx.interpretation(value, ctxFull);
    out.push({
      key: idx.key,
      name: idx.name,
      value,
      unit: idx.unit,
      level: interp.level,
      interpretation: interp.text,
      source: idx.source,
      howTo: idx.howTo,
    });
  }
  return out;
}

// ─────────────────── mapa corporal: marcador → região ────────────────────

export type RegionLevel = 'ok' | 'atencao' | 'alterado' | 'sem_dados';

export interface BodyRegionMarker {
  nameCanonical: string;
  name: string;
  level: Exclude<RegionLevel, 'sem_dados'>;
  valueText: string | null;
}

export interface BodyRegionState {
  key: string;
  label: string;
  emoji: string;
  level: RegionLevel;
  markers: BodyRegionMarker[];
}

/** MarkerState "achatado" p/ computeBodyRegions (permite teste sem importar health-state). */
export interface RegionInput {
  nameCanonical: string;
  name: string;
  priority: 'normal' | 'leve' | 'moderada' | 'importante';
  valueText: string | null;
}

/** Regiões do corpo + como casar marcadores (canonical exato OU contém — p/ analitos
 *  sem canonical próprio, ex.: BILIRRUBINA TOTAL / DHEA / FÓSFORO). */
const BODY_REGIONS: { key: string; label: string; emoji: string; matchers: string[] }[] = [
  { key: 'cerebro', label: 'Cérebro & tireoide (SNC)', emoji: '🧠', matchers: ['TSH', 'T4_LIVRE', 'T3'] },
  { key: 'coracao', label: 'Coração', emoji: '❤️', matchers: ['COLESTEROL_TOTAL', 'LDL', 'HDL', 'TRIGLICERIDES', 'PCR'] },
  { key: 'pulmoes', label: 'Pulmões', emoji: '🫁', matchers: [] }, // sem analito de rotina no painel — região honesta "sem dados"
  { key: 'figado', label: 'Fígado', emoji: '🍽️', matchers: ['TGO', 'TGP', 'GAMA_GT', 'BILIRRUBINA'] },
  { key: 'pancreas', label: 'Pâncreas & glicemia', emoji: '🧬', matchers: ['GLICEMIA', 'HEMOGLOBINA_GLICADA', 'INSULINA'] },
  { key: 'rins', label: 'Rins', emoji: '🫘', matchers: ['CREATININA', 'UREIA', 'CISTATINA_C'] },
  { key: 'sangue', label: 'Sangue (hemograma)', emoji: '🩸', matchers: ['HEMOGLOBINA', 'HEMATOCRITO', 'LEUCOCITOS', 'PLAQUETAS'] },
  { key: 'musculos', label: 'Músculos', emoji: '💪', matchers: ['CREATINO_QUINASE', 'DHEA'] }, // TGO/AST também é muscular — mas região hepática já o cobre
  { key: 'ossos', label: 'Ossos & metabolismo', emoji: '🦴', matchers: ['VITAMINA_D', 'CALCIO', 'FOSFORO', 'FOSFATASE'] },
];

const matchRegion = (canon: string, matcher: string): boolean =>
  canon === matcher || canon.includes(matcher);

/** prioridade MarkerState → nível de região. */
const levelOf = (p: RegionInput['priority']): Exclude<RegionLevel, 'sem_dados'> =>
  p === 'normal' ? 'ok' : p === 'leve' ? 'atencao' : 'alterado';

const LEVEL_RANK: Record<Exclude<RegionLevel, 'sem_dados'>, number> = { ok: 0, atencao: 1, alterado: 2 };

/**
 * Agrega marcadores por região do corpo p/ o Mapa Corporal. Região acende no pior
 * nível dos seus marcadores; sem nenhum marcador → 'sem_dados' (cinza — nunca verde).
 */
export function computeBodyRegions(markers: RegionInput[]): BodyRegionState[] {
  return BODY_REGIONS.map((r) => {
    const inRegion = markers.filter((mk) => r.matchers.some((mt) => matchRegion(mk.nameCanonical, mt)));
    if (inRegion.length === 0) {
      return { key: r.key, label: r.label, emoji: r.emoji, level: 'sem_dados' as const, markers: [] };
    }
    const regionMarkers: BodyRegionMarker[] = inRegion.map((mk) => ({
      nameCanonical: mk.nameCanonical,
      name: mk.name,
      level: levelOf(mk.priority),
      valueText: mk.valueText,
    }));
    const level = regionMarkers.reduce<Exclude<RegionLevel, 'sem_dados'>>(
      (worst, x) => (LEVEL_RANK[x.level] > LEVEL_RANK[worst] ? x.level : worst),
      'ok',
    );
    return { key: r.key, label: r.label, emoji: r.emoji, level, markers: regionMarkers };
  });
}
