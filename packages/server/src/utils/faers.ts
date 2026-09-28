import { normalizeKey } from './normalize';

/**
 * Farmacovigilância — sinais de evento adverso da openFDA FAERS (feature D).
 * Util PURO (sem fetch, sem prisma) → 100% testável unit.
 *
 * Contrato da rota: GET /api/medications/:medId/event-signals
 * Fonte: https://api.fda.gov/drug/event.json (relatos espontâneos — NÃO é
 * incidência nem causalidade; a UI repete esse disclaimer).
 */

/** TTL do cache de sucesso (7 dias — FAERS muda devagar). */
export const FAERS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** TTL do cache de "não encontrado" (1h — 404/429 do openFDA não ficam congelados). */
export const FAERS_NOT_FOUND_TTL_MS = 60 * 60 * 1000;
/** Timeout da chamada ao openFDA (AbortController — nunca estoura a request do usuário). */
export const FAERS_TIMEOUT_MS = 15_000;

export interface FaersEvent {
  term: string;   // termo MedDRA original (EN) — ex.: "Nausea"
  termPt: string; // tradução PT-BR (ou o original quando não mapeado)
  count: number;  // nº de relatos
}

/** Payload persistido em DrugSignalCache.data. */
export interface FaersCacheData {
  events: FaersEvent[];
  searched: string;  // termo efetivamente buscado (ex.: "LOSARTAN POTASSIUM")
  notFound?: boolean; // true = openFDA 404/429 — cache com TTL curto (1h)
}

/**
 * Tradução PT-BR dos ~35 termos MedDRA mais relatados no FAERS.
 * Termo fora do mapa → mostra o original (spec: nunca inventar tradução).
 */
const MEDDRA_PT: Record<string, string> = {
  'nausea': 'Náusea',
  'headache': 'Dor de cabeça',
  'dizziness': 'Tontura',
  'fatigue': 'Fadiga',
  'vomiting': 'Vômito',
  'diarrhoea': 'Diarreia',
  'rash': 'Erupção cutânea',
  'pruritus': 'Coceira',
  'abdominal pain upper': 'Dor abdominal alta',
  'abdominal pain': 'Dor abdominal',
  'dyspnoea': 'Falta de ar',
  'somnolence': 'Sonolência',
  'insomnia': 'Insônia',
  'weight decreased': 'Perda de peso',
  'weight increased': 'Ganho de peso',
  'asthenia': 'Fraqueza',
  'pyrexia': 'Febre',
  'arthralgia': 'Dor articular',
  'myalgia': 'Dor muscular',
  'back pain': 'Dor nas costas',
  'pain': 'Dor',
  'chest pain': 'Dor no peito',
  'palpitations': 'Palpitações',
  'hypertension': 'Pressão alta',
  'hypotension': 'Pressão baixa',
  'syncope': 'Desmaio',
  'alopecia': 'Queda de cabelo',
  'cough': 'Tosse',
  'constipation': 'Prisão de ventre',
  'dyspepsia': 'Má digestão',
  'oedema peripheral': 'Inchaço nas pernas',
  'paraesthesia': 'Formigamento',
  'tremor': 'Tremor',
  'anxiety': 'Ansiedade',
  'depression': 'Depressão',
  'decreased appetite': 'Perda de apetite',
  'blood glucose increased': 'Glicose alta',
  // Top globais do FAERS (o count é case-insensitive, mas os termos dominantes):
  'drug ineffective': 'Medicação sem efeito',
  'off label use': 'Uso fora da bula',
  'death': 'Óbito',
  'feeling abnormal': 'Sensação anormal',
  'malaise': 'Mal-estar',
  'fall': 'Queda',
  'condition aggravated': 'Condição agravada',
  'incorrect dose administered': 'Dose incorreta administrada',
  'product quality issue': 'Problema de qualidade do produto',
  'gastrointestinal disorder': 'Problema gastrointestinal',
  'therapy non-responder': 'Sem resposta ao tratamento',
  'renal failure': 'Falência renal',
};

/** Traduz um termo MedDRA. O FAERS devolve EM CAIXA ALTA — normalizamos p/
 *  minúsculas antes de consultar (bug da 1ª versão: match exato 'Nausea' x
 *  'NAUSEA' deixava TUDO em inglês). Sem tradução → original. */
export function translateMeddra(term: string): string {
  return MEDDRA_PT[String(term).toLowerCase().trim()] ?? term;
}

/**
 * Denominação comum BR → INN inglês (token a token). O FAERS registra
 * medicinalproduct em INGLÊS ("LOSARTAN POTASSIUM"); buscar "LOSARTANA
 * POTASSICA" retornaria 404 pra praticamente todo remédio nacional — o mapa
 * token cobre qualquer combinação (VARFARINA SODICA, METOPROLOL SUCCINATO…)
 * sem enumerar nomes completos.
 */
const INN_EN: Record<string, string> = {
  // cardio/anti-hipertensivos
  'LOSARTANA': 'LOSARTAN', 'POTASSICA': 'POTASSIUM', 'SODICA': 'SODIUM', 'SODICO': 'SODIUM',
  'ENALAPRILA': 'ENALAPRIL', 'AMLODIPINA': 'AMLODIPINE', 'ANLODIPINO': 'AMLODIPINE',
  'HIDROCLOROTIAZIDA': 'HYDROCHLOROTHIAZIDE', 'VALSARTANA': 'VALSARTAN',
  'OLMESARTANA': 'OLMESARTAN', 'CANDESARTANA': 'CANDESARTAN', 'IRBESARTANA': 'IRBESARTAN',
  'CAPTOPRIL': 'CAPTOPRIL', 'LISINOPRILA': 'LISINOPRIL', 'RAMIPRILA': 'RAMIPRIL',
  'CARVEDILOL': 'CARVEDILOL', 'SUCCINATO': 'SUCCINATE', 'TARTARATO': 'TARTRATE',
  'PROPRANOLOL': 'PROPRANOLOL', 'NEBIVOLOL': 'NEBIVOLOL', 'ATENOLOL': 'ATENOLOL',
  'FUROSEMIDA': 'FUROSEMIDE', 'ESPIRONOLACTONA': 'SPIRONOLACTONE',
  'VERAPAMIL': 'VERAPAMIL', 'DILTIAZEM': 'DILTIAZEM', 'SOTALOL': 'SOTALOL',
  'NITRENDIPINA': 'NITRENDIPINE', 'ISOSSORBIDA': 'ISOSORBIDE', 'MONONITRATO': 'MONONITRATE',
  // estatinas/lipídios
  'ATORVASTATINA': 'ATORVASTATIN', 'SIMVASTATINA': 'SIMVASTATIN', 'ROSUVASTATINA': 'ROSUVASTATIN',
  'SINVASTATINA': 'SIMVASTATIN', 'EZETIMIBE': 'EZETIMIBE', 'FENOFIBRATO': 'FENOFIBRATE',
  // diabetes
  'METFORMINA': 'METFORMIN', 'GLIBENCLAMIDA': 'GLYBURIDE', 'GLICLAZIDA': 'GLICLAZIDE',
  'SITAGLIPTINA': 'SITAGLIPTIN', 'VILDAGLIPTINA': 'VILDAGLIPTIN', 'DAPAGLIFLOZINA': 'DAPAGLIFLOZIN',
  'EMPAGLIFLOZINA': 'EMPAGLIFLOZIN', 'SEMAGLUTIDA': 'SEMAGLUTIDE', 'TIRZEPATIDA': 'TIRZEPATIDE',
  'LIRAGLUTIDA': 'LIRAGLUTIDE', 'EXENATIDA': 'EXENATIDE', 'INSULINA': 'INSULIN',
  'GLIMEPIRIDA': 'GLIMEPIRIDE', 'PIOGLITAZONA': 'PIOGLITAZONE', 'ACARBOSE': 'ACARBOSE',
  // GI
  'OMEPRAZOL': 'OMEPRAZOLE', 'PANTOPRAZOL': 'PANTOPRAZOLE', 'ESOMEPRAZOL': 'ESOMEPRAZOLE',
  'LANSOPRAZOL': 'LANSOPRAZOLE', 'RANITIDINA': 'RANITIDINE', 'DOMPERIDONA': 'DOMPERIDONE',
  'ONDANSETRONA': 'ONDANSETRON', 'MESALAZINA': 'MESALAMINE',
  // SNC/psiquiatria
  'SERTRALINA': 'SERTRALINE', 'PAROXETINA': 'PAROXETINE', 'FLUOXETINA': 'FLUOXETINE',
  'VENLAFAXINA': 'VENLAFAXINE', 'DULOXETINA': 'DULOXETINE', 'BUPROPIONA': 'BUPROPION',
  'MIRTAZAPINA': 'MIRTAZAPINE', 'TRAZODONA': 'TRAZODONE', 'QUETIAPINA': 'QUETIAPINE',
  'OLANZAPINA': 'OLANZAPINE', 'RISPERIDONA': 'RISPERIDONE', 'ARIPIPRAZOL': 'ARIPIPRAZOLE',
  'LAMOTRIGINA': 'LAMOTRIGINE', 'TOPIRAMATO': 'TOPIRAMATE', 'ACIDO': 'ACID', 'VALPROICO': 'VALPROIC',
  'FENITOINA': 'PHENYTOIN', 'CARBAMAZEPINA': 'CARBAMAZEPINE', 'PREGABALINA': 'PREGABALIN',
  'GABAPENTINA': 'GABAPENTIN', 'AMITRIPTILINA': 'AMITRIPTYLINE', 'NORTRIPTILINA': 'NORTRIPTYLINE',
  'MEMANTINA': 'MEMANTINE', 'RIVASTIGMINA': 'RIVASTIGMINE', 'DONEPEZILA': 'DONEPEZIL',
  'LEVODOPA': 'LEVODOPA', 'PRAMIPEXOLE': 'PRAMIPEXOLE',
  // tireoide
  'LEVOTIROXINA': 'LEVOTHIROXINE',
  // anticoagulantes/antiagregantes
  'VARFARINA': 'WARFARIN', 'RIVAROXABANA': 'RIVAROXABAN', 'APIXABANA': 'APIXABAN',
  'DABIGATRANA': 'DABIGATRAN', 'CLOPIDOGREL': 'CLOPIDOGREL',
  'ACETILSALICILICO': 'ACETYLSALICYLIC',
  // analgésicos/anti-inflamatórios
  'PARACETAMOL': 'ACETAMINOPHEN', 'DIPIRONA': 'DIPYRONE', 'IBUPROFENO': 'IBUPROFEN',
  'CETOPROFENO': 'KETOPROFEN', 'NAPROXENO': 'NAPROXEN', 'DICLOFENACO': 'DICLOFENAC',
  'PIROXICAM': 'PIROXICAM', 'MELOXICAM': 'MELOXICAM', 'CELECOXIBE': 'CELECOXIB',
  'TRAMADOL': 'TRAMADOL', 'CODEINA': 'CODEINE', 'MORFINA': 'MORPHINE', 'FENTANILA': 'FENTANYL',
  // respiratório/alergia
  'SALBUTAMOL': 'ALBUTEROL', 'FORMOTEROL': 'FORMOTEROL', 'BUDSONIDA': 'BUDESONIDE',
  'BUDESONIDA': 'BUDESONIDE', 'MONTELUCASTE': 'MONTELUKAST', 'LORATADINA': 'LORATADINE',
  'CETIRIZINA': 'CETIRIZINE', 'DESLORATADINA': 'DESLORATADINE', 'FEDEXOFENADINA': 'FEXOFENADINE',
  'IPRATROPIO': 'IPRATROPIUM', 'TIOTROPIO': 'TIOTROPIUM',
  // antibióticos
  'AMOXICILINA': 'AMOXICILLIN', 'AZITROMICINA': 'AZITHROMYCIN', 'CLARITROMICINA': 'CLARITHROMYCIN',
  'CEFALEXINA': 'CEPHALEXIN', 'CEFUROXIMA': 'CEFUROXIME', 'CEFTRIAXONA': 'CEFTRIAXONE',
  'CIPROFLOXACINO': 'CIPROFLOXACIN', 'LEVOFLOXACINO': 'LEVOFLOXACIN', 'NITROFURANTOINA': 'NITROFURANTOIN',
  'SULFAMETOXAZOL': 'SULFAMETHOXAZOLE', 'TRIMETOPRIMA': 'TRIMETHOPRIM', 'CLINDAMICINA': 'CLINDAMYCIN',
  'DOXICICLINA': 'DOXYCYCLINE', 'METRONIDAZOL': 'METRONIDAZOLE', 'CLOTRIMAZOL': 'CLOTRIMAZOLE',
  'FLUCONAZOL': 'FLUCONAZOLE', 'ITRACONAZOL': 'ITRACONAZOLE', 'TERBINAFINA': 'TERBINAFINE',
  // urológico/ outros
  'TAMSULOSINA': 'TAMSULOSIN', 'SILDENAFILA': 'SILDENAFIL', 'TADALAFILA': 'TADALAFIL',
  'FINASTERIDA': 'FINASTERIDE', 'DUTASTERIDA': 'DUTASTERIDE', 'ALOPURINOL': 'ALLOPURINOL',
  'COLCHICINA': 'COLCHICINE', 'ALENDRONATO': 'ALENDRONATE', 'RISSEDRONATO': 'RISEDRONATE',
  'CINACALCETE': 'CINACALCET', 'SEVELAMER': 'SEVELAMER', 'HIDROXIZINA': 'HYDROXYZINE',
};
// sanity: nunca deixar valor vazio no mapa
for (const [k, v] of Object.entries(INN_EN)) if (!v) delete INN_EN[k];

/** Tokens de dose/forma descartáveis na chave de busca (o FAERS casa o nome, não a embalagem). */
const DROP_TOKENS = new Set([
  'MG', 'MCG', 'ML', 'G', 'UI', 'UG', 'IU', 'CP', 'CPS', 'CAPS', 'CAP', 'COMPRIMIDO', 'COMPRIMIDOS',
  'CAPSULA', 'CAPSULAS', 'CX', 'REVISIONAL', 'GENERICO', 'SIMILAR', 'REFERENCE', 'RETARD',
  'LIBERACAO', 'PROLONGADA', 'ORODISPERSIVEL', 'SOLUCAO', 'SUSPENSAO', 'INJETAVEL', 'TOPICO', 'GEL',
  'FRASCO', 'AMPOLA', 'SACH', 'REVEN', 'XR', 'XL', 'SR', 'ODT',
]);

/**
 * Termo de busca no openFDA a partir do remédio do paciente.
 * Prioriza o princípio ativo canônico (`activeIngredient` — cheio de sufixo de
 * embalagem), cai pro nome livre. Normaliza (sem acento/MAIÚSCULAS), descarta
 * dose/forma e traduz tokens BR→INN inglês. Retorna null quando não sobra nada
 * buscável (rota responde 404 amigável).
 */
export function faersSearchTerm(activeIngredient: string | null | undefined, name: string | null | undefined): string | null {
  const base = normalizeKey(activeIngredient || name || '');
  if (!base) return null;
  const tokens = base
    .split(' ')
    .filter((t) => t && !DROP_TOKENS.has(t) && !/^\d+([.,]\d+)?$/.test(t) && !/^\d+(MG|MCG|ML|G|UI)$/i.test(t));
  const mapped = tokens.map((t) => INN_EN[t] ?? t);
  return mapped.length ? mapped.join(' ') : null;
}

/** Chave única de cache do FAERS (medKey) — a partir do termo de busca.
 *  Prefixo v2: invalida em lote o cache da 1ª versão (termos sem tradução PT). */
export function faersCacheKey(searchTerm: string): string {
  return `v2-${normalizeKey(searchTerm)}`;
}

/**
 * Monta a URL do openFDA. O `+` precisa continuar literal (separador AND do
 * openFDA) — encodeURIComponent encodaria como %2B, então devolvemos `+`
 * depois. Espaços dentro do nome vão como `+` (formalmente space na query).
 */
export function buildFaersUrl(searchTerm: string): string {
  const q = `patient.drug.medicinalproduct:"${searchTerm}"+patient.drug.drugcharacterization:1`;
  const search = encodeURIComponent(q.replace(/\s+/g, '+')).replace(/%2B/gi, '+');
  return `https://api.fda.gov/drug/event.json?search=${search}&count=patient.reaction.reactionmeddrapt.exact&limit=10`;
}

/**
 * Parser da resposta `count=` do openFDA: [{term, count}, ...] → eventos
 * traduzidos (top 10). Ignora lixo de forma defensiva (term não-string,
 * count não-numérico). Resposta sem `results` (array vazio) → [].
 */
export function parseFaersEvents(json: unknown): FaersEvent[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r): r is { term: string; count: number } =>
      !!r && typeof (r as { term?: unknown }).term === 'string' && typeof (r as { count?: unknown }).count === 'number')
    .slice(0, 10)
    .map((r) => ({ term: r.term, termPt: translateMeddra(r.term), count: r.count }));
}
