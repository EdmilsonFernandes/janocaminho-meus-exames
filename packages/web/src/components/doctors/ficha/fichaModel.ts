/**
 * FICHA DA CONSULTA — regras puras (28/11/26).
 *
 * Decidido com o painel de médicos (MFC, endocrino, cardio — "30 consultas por dia"):
 *  - nada de escore inventado pelo app; vermelho SÓ para alergia e interação confirmada
 *    por exame (ex.: K alto em uso de Losartana + Espironolactona) — o resto é âmbar/neutro;
 *  - todo valor com data; mais de 90 dias = "desatualizado";
 *  - TFGe calculada (CKD-EPI 2021, sem raça) ao lado da creatinina, com a fonte escrita;
 *  - marcadores agrupados por eixo clínico (não alfabético);
 *  - "Copiar resumo": texto pronto para colar no prontuário da clínica — determinístico,
 *    sem IA, só o que o paciente compartilhou.
 * Linguagem: o app descreve dados; a conduta é do médico (nada de "suspender", "diagnóstico").
 */

export type Sex = 'male' | 'female' | null | undefined;

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/* ── datas ─────────────────────────────────────────────────────────────────────── */

export const daysSince = (iso?: string | null, now = Date.now()): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : null;
};

/** "hoje" · "há 9 dias" · "há 4 meses" · "há 1 ano" */
export const ago = (iso?: string | null, now = Date.now()): string => {
  const d = daysSince(iso, now);
  if (d == null) return '';
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  const m = Math.floor(d / 30.4);
  if (m < 12) return m <= 1 ? 'há 1 mês' : `há ${m} meses`;
  const y = Math.floor(m / 12);
  return y === 1 ? 'há 1 ano' : `há ${y} anos`;
};

export const STALE_DAYS = 90;
export const isStale = (iso?: string | null, now = Date.now()) => (daysSince(iso, now) ?? 0) > STALE_DAYS;

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

/** 8.1 → "8,1" · 162 → "162" · 1.42 → "1,42" */
export const fmtNum = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return Number(v.toFixed(digits)).toLocaleString('pt-BR', { maximumFractionDigits: digits });
};

/* ── perfil ────────────────────────────────────────────────────────────────────── */

/** Texto livre do perfil clínico → chips curtos ("Hipertensão, diabetes tipo 2; ex-tabagista"). */
export const parseConditions = (profile?: string | null): string[] => {
  if (!profile) return [];
  const parts = profile.split(/[,;\n•]+|\s+e\s+(?=[a-záéíóúâêôãõç])/i).map((s) => s.trim().replace(/\.$/, '')).filter((s) => s.length >= 2);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = norm(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p.charAt(0).toUpperCase() + p.slice(1));
  }
  return out;
};

/** Alergia: string vazia / "não" / "nenhuma" → sem alergia informada. */
export const parseAllergy = (raw?: string | null): { has: boolean; text: string } => {
  const t = (raw || '').trim();
  if (!t || /^(nao|não|nenhuma?|sem alergias?|nega|n\/a|-)\.?$/i.test(t)) return { has: false, text: '' };
  return { has: true, text: t };
};

export const bmi = (weightKg?: number | null, heightCm?: number | null): number | null =>
  weightKg && heightCm && heightCm > 80 ? weightKg / ((heightCm / 100) ** 2) : null;

/* ── TFGe (CKD-EPI 2021, sem coeficiente de raça) ──────────────────────────────── */

export const egfrCkdEpi2021 = (creatinineMgDl: number | null | undefined, age: number | null | undefined, sex: Sex): number | null => {
  if (!creatinineMgDl || creatinineMgDl <= 0 || !age || age < 18 || (sex !== 'male' && sex !== 'female')) return null;
  const female = sex === 'female';
  const k = female ? 0.7 : 0.9;
  const a = female ? -0.241 : -0.302;
  const r = creatinineMgDl / k;
  const v = 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
  return Math.round(v);
};

/* ── eixos clínicos ────────────────────────────────────────────────────────────── */

export const AXES = [
  { key: 'glic', label: 'Glicêmico', re: /GLICAD|A1C|GLICOSE|GLICEMIA|INSULINA|HOMA|PEPTIDEO C/ },
  { key: 'renal', label: 'Rim e eletrólitos', re: /CREATININ|UREIA|POTASSIO|SODIO|MICROALBUMIN|ALBUMINURIA|TFG|FILTRACAO|ACIDO URICO|MAGNESIO|CALCIO/ },
  { key: 'lip', label: 'Lipídios', re: /COLESTEROL|LDL|HDL|TRIGLICER|APOLIPO|LIPOPROTEINA/ },
  { key: 'tir', label: 'Tireoide', re: /TSH|T4|T3|TIREO|TPO/ },
  { key: 'hep', label: 'Fígado', re: /TGO|TGP|AST|ALT|GAMA|GGT|BILIRRUB|FOSFATASE/ },
  { key: 'hemo', label: 'Sangue', re: /HEMOGLOBINA$|HEMATOCRIT|HEMACIA|ERITRO|LEUCO|PLAQUET|FERRITIN|FERRO|VCM|HCM|B12|FOLATO|INR|TAP/ },
  { key: 'horm', label: 'Hormônios', re: /TESTOSTERON|ESTRADIOL|PROLACTIN|LH|FSH|CORTISOL|DHEA|SHBG|PROGESTERON/ },
  { key: 'vit', label: 'Vitaminas', re: /VITAMINA|25.?OH/ },
] as const;
export type AxisKey = (typeof AXES)[number]['key'] | 'outros';

export const axisOf = (name: string): { key: AxisKey; label: string } => {
  const n = norm(name);
  // HbA1c antes de "HEMOGLOBINA" do hemograma
  for (const a of AXES) if (a.re.test(n)) return { key: a.key, label: a.label };
  return { key: 'outros', label: 'Outros' };
};

/** Nome amigável e curto (o laudo vem em CAIXA ALTA). */
const NICE: [RegExp, string][] = [
  [/HEMOGLOBINA GLICADA|HBA1C|A1C/, 'HbA1c'],
  [/^GLICOSE|GLICEMIA DE JEJUM/, 'Glicemia de jejum'],
  [/COLESTEROL LDL|^LDL/, 'LDL'],
  [/COLESTEROL HDL|^HDL/, 'HDL'],
  [/NAO.?HDL/, 'Não-HDL'],
  [/COLESTEROL TOTAL/, 'Colesterol total'],
  [/TRIGLICER/, 'Triglicerídeos'],
  [/CREATININ/, 'Creatinina'],
  [/POTASSIO/, 'Potássio'],
  [/SODIO/, 'Sódio'],
  [/^TSH/, 'TSH'],
  [/T4 LIVRE/, 'T4 livre'],
  [/VITAMINA D|25.?OH/, 'Vitamina D'],
  [/VITAMINA B12/, 'Vitamina B12'],
  [/HEMATOCRIT/, 'Hematócrito'],
  [/^HEMOGLOBINA$/, 'Hemoglobina'],
  [/FERRITIN/, 'Ferritina'],
  [/MICROALBUMIN/, 'Microalbuminúria'],
  [/ACIDO URICO/, 'Ácido úrico'],
];
export const niceName = (name: string): string => {
  const n = norm(name);
  for (const [re, label] of NICE) if (re.test(n)) return label;
  const s = name.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ── interação × exame ─────────────────────────────────────────────────────────── */

/** Qual exame confirma o risco de cada interação (pela descrição do efeito). */
const EFFECT_TO_MARKER: [RegExp, RegExp][] = [
  [/HIPERCALEM|POTASSIO ALTO|HIPERPOTASS/, /POTASSIO/],
  [/HIPOCALEM|POTASSIO BAIXO/, /POTASSIO/],
  [/HIPOGLIC/, /GLICOSE|GLICAD/],
  [/SANGRAMENTO|HEMORRAG|INR|ANTICOAG/, /INR|TAP|PLAQUET/],
  [/NEFRO|RENAL|RIM|CREATININ/, /CREATININ/],
  [/HIPONATREM|SODIO/, /SODIO/],
  [/MIOPATIA|RABDOMI|CK\b|CPK/, /CPK|CK\b|CREATINOFOSFOQUINASE/],
  [/HEPAT|FIGADO|TRANSAMIN/, /TGO|TGP|AST|ALT/],
];

export interface InteractionHit { drugA: string; drugB: string; severity?: string; effect?: string; recommendation?: string }
export interface MarkerNow { name: string; value: number | null; valueText?: string | null; unit?: string | null; at?: string | null; abnormal: boolean; prev?: number | null }

export interface SafetyLine { level: 'red' | 'amber'; title: string; detail: string }

/** Interação vira VERMELHO só quando o exame ligado ao efeito está fora da faixa agora. */
export const linkInteractions = (hits: InteractionHit[], markers: MarkerNow[]): SafetyLine[] =>
  hits.map((h) => {
    const eff = norm(`${h.effect ?? ''} ${h.recommendation ?? ''}`);
    const pair = EFFECT_TO_MARKER.find(([e]) => e.test(eff));
    const m = pair ? markers.find((x) => pair[1].test(norm(x.name))) : undefined;
    const drugs = `${h.drugA} + ${h.drugB}`;
    if (m && m.abnormal) {
      const prev = m.prev != null ? ` (era ${fmtNum(m.prev)})` : '';
      return { level: 'red' as const, title: `${niceName(m.name)} ${m.value != null ? fmtNum(m.value) : m.valueText ?? ''}${m.unit ? ' ' + m.unit : ''}${prev} em uso de ${drugs}`, detail: `${h.effect ?? 'Interação registrada'} — avaliar.` };
    }
    return { level: 'amber' as const, title: `Interação: ${drugs}`, detail: `${h.effect ?? ''}${m ? ` ${niceName(m.name)} na faixa (${fmtNum(m.value)}${m.unit ? ' ' + m.unit : ''}).` : ''}`.trim() };
  }).sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));

/* ── pressão arterial domiciliar ───────────────────────────────────────────────── */

export interface BpReading { systolic: number; diastolic: number; at: string }
export const bpSummary = (rows: BpReading[] | null | undefined) => {
  const r = (rows ?? []).filter((x) => x.systolic > 0 && x.diastolic > 0).slice(0, 7);
  if (!r.length) return null;
  const s = Math.round(r.reduce((t, x) => t + x.systolic, 0) / r.length);
  const d = Math.round(r.reduce((t, x) => t + x.diastolic, 0) / r.length);
  const above = r.filter((x) => x.systolic >= 135 || x.diastolic >= 85).length;
  return { systolic: s, diastolic: d, n: r.length, above, lastAt: r[0].at, elevated: s >= 135 || d >= 85 };
};

/* ── resumo para colar ─────────────────────────────────────────────────────────── */

export interface SummaryInput {
  name: string; age?: number | null; sex?: Sex; convenio?: string | null;
  allergy?: string | null; conditions?: string[];
  meds?: { name: string; dosage?: string | null; frequency?: string | null }[];
  safety?: SafetyLine[];
  changes?: { name: string; prev: number | null; last: number | null; unit?: string | null }[];
  changesSince?: string | null;
  abnormalNow?: MarkerNow[];
  egfr?: number | null;
  bp?: ReturnType<typeof bpSummary>;
  weightKg?: number | null; bmi?: number | null; weightDelta?: number | null;
  pending?: string[];
}

export const buildCopySummary = (s: SummaryInput): string => {
  const L: string[] = [];
  const sexL = s.sex === 'male' ? 'M' : s.sex === 'female' ? 'F' : '';
  L.push([s.name, s.age != null ? `${s.age}a` : '', sexL, s.convenio || ''].filter(Boolean).join(', ') + '.');
  if (s.conditions?.length) L.push(`Condições: ${s.conditions.join(', ')}.`);
  L.push(`Alergias: ${s.allergy ? s.allergy : 'nenhuma informada pelo paciente'}.`);
  if (s.meds?.length) L.push(`Medicações em uso: ${s.meds.map((m) => [m.name, m.frequency].filter(Boolean).join(' ')).join('; ')}.`);
  for (const x of s.safety ?? []) L.push(`${x.level === 'red' ? 'Atenção' : 'Obs.'}: ${x.title}.`);
  if (s.changes?.length) L.push(`${s.changesSince ? `Desde ${fmtDate(s.changesSince)}` : 'Últimos exames'}: ${s.changes.map((c) => `${niceName(c.name)} ${fmtNum(c.prev)}→${fmtNum(c.last)}${c.unit ? ' ' + c.unit : ''}`).join('; ')}.`);
  const extra = (s.abnormalNow ?? []).filter((m) => !(s.changes ?? []).some((c) => norm(niceName(c.name)) === norm(niceName(m.name))));
  if (extra.length) L.push(`Fora da faixa: ${extra.map((m) => `${niceName(m.name)} ${m.value != null ? fmtNum(m.value) : m.valueText ?? ''}${m.unit ? ' ' + m.unit : ''}${m.at ? ` (${fmtDate(m.at)})` : ''}`).join('; ')}.`);
  if (s.egfr != null) L.push(`TFGe ${s.egfr} mL/min/1,73m² (CKD-EPI 2021).`);
  if (s.bp) L.push(`PA domiciliar: média ${s.bp.systolic}/${s.bp.diastolic} mmHg (${s.bp.n} medidas${s.bp.above ? `, ${s.bp.above} ≥135/85` : ''}).`);
  if (s.weightKg) L.push(`Peso ${fmtNum(s.weightKg)} kg${s.bmi ? ` (IMC ${fmtNum(s.bmi)})` : ''}${s.weightDelta ? `, ${s.weightDelta > 0 ? '+' : ''}${fmtNum(s.weightDelta)} kg` : ''}.`);
  if (s.pending?.length) L.push(`A pedir: ${s.pending.join(', ')}.`);
  L.push('Fonte: dados compartilhados pelo paciente no Dr. Exame (valores extraídos de laudo — conferir o original).');
  return L.join('\n');
};
