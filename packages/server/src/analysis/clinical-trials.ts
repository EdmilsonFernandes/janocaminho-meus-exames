/**
 * FEATURE E — Pesquisas clínicas recrutando (portal do médico).
 * ClinicalTrials.gov API v2 (pública, sem chave) — estudos RECRUITING com site no BRASIL
 * que casam com as condições crônicas do paciente.
 *
 * LGPD: do servidor só sai a PALAVRA-CHAVE EM INGLÊS da condição (map estático abaixo).
 * Nenhum PII/dado de saúde individual viaja na chamada externa — a resposta também é
 * cacheada por condição (tabela clinical_trial_cache, TTL 7 dias), então pacientes com a
 * mesma condição compartilham a mesma entrada de cache (impossível reidentificar).
 *
 * Derivação (conservadora — NÃO inventa condição):
 *  1. Perfil clínico (texto livre PT) → termos com word-boundary, acentos stripados.
 *  2. Remédios de uso contínuo → princípio ativo/princípio genérico → condição tratada
 *     (só fármacos de indicação crônica inequívoca).
 *  3. Marcadores laboratoriais cronicamente alterados (≥2 exames distintos) — apenas
 *     achados que equivalem à própria condição (Hb baixa = anemia; TSH alto/alterado =
 *     tireoide; glicemia/HbA1c altas = diabetes). Prioridade: perfil > remédios > labs.
 * Máx. 3 condições (spec do card: 3-5 estudos por condição).
 */

/** Condição derivada: chave EN p/ a API + rótulo PT p/ o card. */
export interface TrialCondition {
  condition: string; // palavra-chave EN (query.cond)
  conditionPt: string; // rótulo PT-BR no card
}

export interface TrialStudy {
  nctId: string;
  title: string;
  city?: string;
  state?: string;
  url: string;
}

// ── Map estático PT→EN (~18 condições crônicas comuns) ──────────────────────────
// `terms` = termos PT (sem acento, lowercase) casados com word-boundary no perfil clínico.
const CONDITIONS: Record<string, { en: string; pt: string; terms: string[] }> = {
  diabetes: { en: 'diabetes', pt: 'Diabetes', terms: ['diabetes', 'diabetico', 'diabetica', 'insulina dependente'] },
  hypertension: { en: 'hypertension', pt: 'Hipertensão arterial', terms: ['hipertensao', 'hipertensao arterial', 'pressao alta', 'has'] },
  hypothyroidism: { en: 'hypothyroidism', pt: 'Hipotireoidismo', terms: ['hipotireoidismo', 'hipotireose', 'hipotireoidianismo', 'sem tireoide', 'tireoidite de hashimoto'] },
  hyperthyroidism: { en: 'hyperthyroidism', pt: 'Hipertireoidismo', terms: ['hipertireoidismo', 'hipertireose', 'doenca de graves', 'basedow'] },
  hypercholesterolemia: { en: 'hypercholesterolemia', pt: 'Colesterol alto', terms: ['hipercolesterolemia', 'colesterol alto', 'dislipidemia', 'dislipidemia metabolica'] },
  asthma: { en: 'asthma', pt: 'Asma', terms: ['asma', 'bronquite asmatiforme'] },
  depression: { en: 'depression', pt: 'Depressão', terms: ['depressao', 'transtorno depressivo', 'depressao maior'] },
  anxiety: { en: 'anxiety disorder', pt: 'Ansiedade', terms: ['ansiedade', 'transtorno de ansiedade generalizada'] },
  anemia: { en: 'anemia', pt: 'Anemia', terms: ['anemia'] },
  obesity: { en: 'obesity', pt: 'Obesidade', terms: ['obesidade', 'sobrepeso'] },
  ckd: { en: 'chronic kidney disease', pt: 'Doença renal crônica', terms: ['doenca renal cronica', 'drc', 'insuficiencia renal cronica'] },
  rheumatoid: { en: 'rheumatoid arthritis', pt: 'Artrite reumatoide', terms: ['artrite reumatoide', 'artrite reumaticoide'] },
  copd: { en: 'chronic obstructive pulmonary disease', pt: 'DPOC', terms: ['dpoc', 'doenca pulmonar obstrutiva cronica', 'enfisema', 'bronquite cronica'] },
  osteoporosis: { en: 'osteoporosis', pt: 'Osteoporose', terms: ['osteoporose', 'osteopenia'] },
  apnea: { en: 'obstructive sleep apnea', pt: 'Apneia do sono', terms: ['apneia do sono', 'apneia obstrutiva do sono', 'saos'] },
  heart_failure: { en: 'heart failure', pt: 'Insuficiência cardíaca', terms: ['insuficiencia cardiaca', 'ic descompensada'] },
  afib: { en: 'atrial fibrillation', pt: 'Fibrilação atrial', terms: ['fibrilacao atrial', 'fibrilhacao atrial'] },
  migraine: { en: 'migraine', pt: 'Enxaqueca', terms: ['enxaqueca', 'migranea'] },
};

// ── Remédios de uso contínuo → condição (só indicação crônica INEQUÍVOCA) ───────
// Chave = nome genérico/princípio ativo normalizado (word-boundary). Polivalentes
// (propranolol, prednisona, metotrexato, anticoagulantes, semaglutida…) ficam FORA.
const DRUG_TO_CONDITION: Record<string, string> = {
  // diabetes
  metformina: 'diabetes', insulina: 'diabetes', glimepirida: 'diabetes', glibenclamida: 'diabetes',
  sitagliptina: 'diabetes', empagliflozina: 'diabetes', dapagliflozina: 'diabetes', pioglitazona: 'diabetes',
  // hipertensão
  losartana: 'hypertension', valsartana: 'hypertension', candesartana: 'hypertension', olmesartana: 'hypertension',
  enalapril: 'hypertension', lisinopril: 'hypertension', ramipril: 'hypertension', perindoprila: 'hypertension',
  amlodipino: 'hypertension', nifedipino: 'hypertension', carvedilol: 'hypertension', atenolol: 'hypertension',
  hidroclorotiazida: 'hypertension', clortalidona: 'hypertension', espironolactona: 'hypertension',
  // tireoide
  levotiroxina: 'hypothyroidism', metimazol: 'hyperthyroidism', propiltiouracil: 'hyperthyroidism',
  // colesterol
  atorvastatina: 'hypercholesterolemia', sinvastatina: 'hypercholesterolemia', rosuvastatina: 'hypercholesterolemia',
  ezetimiba: 'hypercholesterolemia',
  // depressão
  sertralina: 'depression', fluoxetina: 'depression', escitalopram: 'depression', paroxetina: 'depression',
  venlafaxina: 'depression', duloxetina: 'depression', bupropiona: 'depression', mirtazapina: 'depression',
  // asma
  salbutamol: 'asthma', formoterol: 'asthma', budesonida: 'asthma', montelucaste: 'asthma', beclometasona: 'asthma',
  // artrite reumatoide
  leflunomida: 'rheumatoid', sulfassalazina: 'rheumatoid', hidroxicloroquina: 'rheumatoid', tofacitinibe: 'rheumatoid',
  // osteoporose
  alendronato: 'osteoporosis', risedronato: 'osteoporosis', denosumabe: 'osteoporosis',
  // DPOC
  tiotropio: 'copd',
  // obesidade
  orlistat: 'obesity',
};

// ── Marcadores laboratoriais crônicos → condição (achado ≡ condição) ────────────
// nameCanonical (utils/normalize.ts) + direção da alteração. Exige ≥2 EXAMES distintos.
const MARKER_RULES: { canonicals: string[]; direction: 'HIGH' | 'LOW'; condition: string }[] = [
  { canonicals: ['HEMOGLOBINA'], direction: 'LOW', condition: 'anemia' },
  { canonicals: ['GLICEMIA', 'HEMOGLOBINA_GLICADA'], direction: 'HIGH', condition: 'diabetes' },
  { canonicals: ['TSH'], direction: 'HIGH', condition: 'hypothyroidism' },
  { canonicals: ['TSH'], direction: 'LOW', condition: 'hyperthyroidism' },
];

/** Normaliza p/ match: minúsculas, sem acento, não-letras → espaço (mesma família do normalizeKey). */
const normText = (s: string): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Word-boundary match (evita 'has' casar dentro de 'farmacia', 'tag' em 'estagio'). */
const hasTerm = (text: string, term: string): boolean =>
  new RegExp(`(^| )${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(text);

export interface DeriveInput {
  clinicalProfile?: string | null;
  medications?: { name?: string | null; activeIngredient?: string | null; active?: boolean | null }[];
  abnormalItems?: { nameCanonical?: string | null; flag?: string | null; examId?: string | null }[];
}

/**
 * Deriva até 3 condições do paciente. Ordem de confiança: perfil clínico explícito →
 * remédio de uso contínuo → marcador alterado em ≥2 exames. Sem sinal → [] (o card
 * não renderiza — nunca chutar).
 */
export function deriveTrialConditions(input: DeriveInput): TrialCondition[] {
  const hits: string[] = []; // ordem de inserção = prioridade

  // 1) Perfil clínico (texto livre)
  const profile = normText(input.clinicalProfile ?? '');
  if (profile) {
    for (const [key, def] of Object.entries(CONDITIONS)) {
      if (hits.includes(key)) continue;
      if (def.terms.some((t) => hasTerm(profile, normText(t)))) hits.push(key);
    }
  }

  // 2) Remédios de uso contínuo (ativos)
  const drugs = normText(
    (input.medications ?? [])
      .filter((m) => m.active !== false)
      .map((m) => `${m.activeIngredient ?? ''} ${m.name ?? ''}`)
      .join(' '),
  );
  if (drugs) {
    for (const [drug, condKey] of Object.entries(DRUG_TO_CONDITION)) {
      if (hits.includes(condKey)) continue;
      if (hasTerm(drugs, drug)) hits.push(condKey);
    }
  }

  // 3) Marcadores cronicamente alterados (≥2 exames distintos, mesma direção)
  const items = input.abnormalItems ?? [];
  if (items.length) {
    for (const rule of MARKER_RULES) {
      if (hits.includes(rule.condition)) continue;
      const exams = new Set(
        items
          .filter((it) => rule.canonicals.includes(String(it.nameCanonical ?? '').toUpperCase()) && String(it.flag ?? '').toUpperCase() === rule.direction)
          .map((it) => it.examId ?? ''),
      );
      exams.delete('');
      if (exams.size >= 2) hits.push(rule.condition);
    }
  }

  return hits.slice(0, 3).map((key) => {
    const def = CONDITIONS[key];
    return { condition: def.en, conditionPt: def.pt };
  });
}

// ── ClinicalTrials.gov API v2 ───────────────────────────────────────────────────
export const CTG_API_BASE = 'https://clinicaltrials.gov/api/v2/studies';

/** URL validada ao vivo (28/09/26): país EN "Brazil" — "BRASIL" devolve lista VAZIA. */
export function trialsUrl(conditionEn: string): string {
  const q = new URLSearchParams({
    'query.cond': conditionEn,
    'filter.overallStatus': 'RECRUITING',
    'filter.advanced': 'AREA[LocationCountry]Brazil',
    pageSize: '5',
    fields: 'NCTId,BriefTitle,OverallStatus,LocationCity,LocationState,LocationCountry',
  });
  return `${CTG_API_BASE}?${q.toString()}`;
}

interface RawStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    contactsLocationsModule?: { locations?: { city?: string; state?: string; country?: string }[] };
  };
}

/** Extrai {nctId,title,local BR} da resposta da API (LocationCity/State/Country vêm pareados por site). */
export function parseStudiesResponse(json: unknown): TrialStudy[] {
  const rows = (json as { studies?: RawStudy[] })?.studies;
  if (!Array.isArray(rows)) return [];
  const out: TrialStudy[] = [];
  for (const s of rows) {
    const idm = s?.protocolSection?.identificationModule;
    const nctId = String(idm?.nctId ?? '').trim();
    const title = String(idm?.briefTitle ?? '').trim();
    if (!nctId || !title) continue;
    const br = (s?.protocolSection?.contactsLocationsModule?.locations ?? []).find(
      (l) => String(l?.country ?? '').toLowerCase() === 'brazil',
    );
    out.push({ nctId, title, city: br?.city || undefined, state: br?.state || undefined, url: `https://clinicaltrials.gov/study/${nctId}` });
  }
  return out;
}

/** Valida dados vindos do cache (Json) — mesma forma que parseStudiesResponse emite. */
export function coerceCachedStudies(v: unknown): TrialStudy[] | null {
  if (!Array.isArray(v)) return null;
  const out: TrialStudy[] = [];
  for (const s of v as any[]) {
    const nctId = String(s?.nctId ?? '').trim();
    const title = String(s?.title ?? '').trim();
    if (!nctId || !title) continue;
    out.push({
      nctId, title,
      city: s?.city ? String(s.city) : undefined,
      state: s?.state ? String(s.state) : undefined,
      url: s?.url ? String(s.url) : `https://clinicaltrials.gov/study/${nctId}`,
    });
  }
  return out;
}

/** Fetch com timeout (AbortController 15s). Lança em falha — quem chama decide degradar. */
export async function fetchTrials(conditionEn: string, timeoutMs = 15_000): Promise<TrialStudy[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(trialsUrl(conditionEn), { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`ClinicalTrials.gov HTTP ${r.status}`);
    return parseStudiesResponse(await r.json());
  } finally {
    clearTimeout(timer);
  }
}
