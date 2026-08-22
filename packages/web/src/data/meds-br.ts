/**
 * Dicionário de medicamentos BR — alimenta o autocomplete de Remédios.
 * `name` = genérico (o que o servidor usa nas regras de interação); `brands` = marcas
 * que o usuário lembra (digita "levoid" → acha "Levotiroxina"); `doses` = apresentações
 * comuns (chips de 1 toque). Curado por ordem de uso no Brasil (crônicos primeiro).
 */
export interface MedEntry { name: string; brands?: string[]; doses?: string[] }

export const MEDS_BR: MedEntry[] = [
  // ── Cardiovascular / pressão ──
  { name: 'Losartana', brands: ['Cozaar', 'Losartana potássica'], doses: ['50 mg', '100 mg'] },
  { name: 'Enalapril', brands: ['Renitec', 'Eupressin', 'Enalaprina'], doses: ['10 mg', '20 mg'] },
  { name: 'Amlodipina', brands: ['Norvasc', 'Novascom'], doses: ['5 mg', '10 mg'] },
  { name: 'Hidroclorotiazida', brands: ['Hidroclorotiazida'], doses: ['25 mg'] },
  { name: 'Furosemida', brands: ['Lasix', 'Neofluxina'], doses: ['20 mg', '40 mg'] },
  { name: 'Espironolactona', brands: ['Aldactone'], doses: ['25 mg', '50 mg'] },
  { name: 'Atenolol', brands: ['Atenol'], doses: ['25 mg', '50 mg'] },
  { name: 'Metoprolol', brands: ['Seloken', 'Betatass'], doses: ['25 mg', '50 mg', '100 mg'] },
  { name: 'Carvedilol', brands: ['Coreg', 'Dilatrend'], doses: ['3,125 mg', '6,25 mg', '12,5 mg', '25 mg'] },
  { name: 'Propranolol', brands: ['Propranolol', 'Inderal'], doses: ['10 mg', '40 mg', '80 mg'] },
  { name: 'Valsartana', brands: ['Diovan'], doses: ['80 mg', '160 mg'] },
  { name: 'Digoxina', brands: ['Lanoxin'], doses: ['0,25 mg'] },
  { name: 'Amiodarona', brands: ['Coraldin', 'Ataurance'], doses: ['200 mg'] },
  // ── Anticoagulantes / antiagregantes ──
  { name: 'Varfarina', brands: ['Marevan'], doses: ['5 mg'] },
  { name: 'Ácido acetilsalicílico', brands: ['AAS', 'Aspirina', 'Cardioaspirina'], doses: ['100 mg', '325 mg'] },
  { name: 'Clopidogrel', brands: ['Plavix', 'Clorel', 'Aretor'], doses: ['75 mg'] },
  { name: 'Rivaroxabana', brands: ['Xarelto'], doses: ['10 mg', '20 mg'] },
  { name: 'Apixabana', brands: ['Eliquis'], doses: ['2,5 mg', '5 mg'] },
  { name: 'Dabigatrana', brands: ['Pradaxa'], doses: ['75 mg', '110 mg', '150 mg'] },
  // ── Diabetes ──
  { name: 'Metformina', brands: ['Glifage', 'Metform', 'Glucophage'], doses: ['500 mg', '850 mg', '1000 mg'] },
  { name: 'Glibenclamida', brands: ['Daonil', 'Gliben'], doses: ['2,5 mg', '5 mg'] },
  { name: 'Glimepirida', brands: ['Amaryl'], doses: ['1 mg', '2 mg', '4 mg'] },
  { name: 'Sitagliptina', brands: ['Januvia'], doses: ['25 mg', '50 mg', '100 mg'] },
  { name: 'Insulina', brands: ['Lantus', 'Humalog', 'Novorapid'], doses: [] },
  // ── Colesterol ──
  { name: 'Sinvastatina', brands: ['Sinvacor', 'Lipex'], doses: ['10 mg', '20 mg', '40 mg'] },
  { name: 'Atorvastatina', brands: ['Citalor', 'Lipitor'], doses: ['10 mg', '20 mg', '40 mg', '80 mg'] },
  { name: 'Rosuvastatina', brands: ['Crestor'], doses: ['5 mg', '10 mg', '20 mg'] },
  // ── Estômago ──
  { name: 'Omeprazol', brands: ['Losec', 'Peprazol'], doses: ['20 mg', '40 mg'] },
  { name: 'Pantoprazol', brands: ['Pantotec', 'Neozol'], doses: ['20 mg', '40 mg'] },
  { name: 'Esomeprazol', brands: ['Nexium'], doses: ['20 mg', '40 mg'] },
  // ── Hormônios ──
  { name: 'Levotiroxina', brands: ['Levoid', 'Puran T4', 'Synthroid', 'Euthyrox'], doses: ['25 mcg', '50 mcg', '75 mcg', '88 mcg', '100 mcg', '112 mcg', '125 mcg'] },
  { name: 'Prednisona', brands: ['Meticorten'], doses: ['5 mg', '20 mg'] },
  { name: 'Prednisolona', brands: ['Predsim'], doses: [] },
  // ── Dor / febre / inflamação ──
  { name: 'Paracetamol', brands: ['Tylenol', 'Parador'], doses: ['500 mg', '750 mg'] },
  { name: 'Dipirona', brands: ['Novalgina', 'Lisador', 'Anador'], doses: ['500 mg'] },
  { name: 'Ibuprofeno', brands: ['Advil', 'Alivium', 'Moment'], doses: ['200 mg', '300 mg', '400 mg', '600 mg'] },
  { name: 'Diclofenaco', brands: ['Voltaren', 'Cataflam'], doses: ['50 mg', '75 mg', '100 mg'] },
  { name: 'Naproxeno', brands: ['Flanax', 'Naproson'], doses: ['275 mg', '550 mg'] },
  { name: 'Ácido mefenâmico', brands: ['Ponstan'], doses: ['500 mg'] },
  { name: 'Celecoxibe', brands: ['Celebra'], doses: ['100 mg', '200 mg'] },
  { name: 'Tramadol', brands: ['Tramal', 'Tramodon'], doses: ['50 mg', '100 mg'] },
  { name: 'Codeína', brands: ['Codein'], doses: ['30 mg'] },
  // ── Saúde mental ──
  { name: 'Sertralina', brands: ['Zoloft', 'Assert', 'Sonrise'], doses: ['25 mg', '50 mg', '100 mg'] },
  { name: 'Fluoxetina', brands: ['Prozac', 'Verotin', 'Lustral'], doses: ['10 mg', '20 mg'] },
  { name: 'Escitalopram', brands: ['Lexapro', 'Reconter'], doses: ['10 mg', '15 mg', '20 mg'] },
  { name: 'Paroxetina', brands: ['Aropax', 'Pondera'], doses: ['10 mg', '20 mg'] },
  { name: 'Venlafaxina', brands: ['Efexor'], doses: ['37,5 mg', '75 mg', '150 mg'] },
  { name: 'Bupropiona', brands: ['Wellbutrin', 'Zyban'], doses: ['150 mg', '300 mg'] },
  { name: 'Clonazepam', brands: ['Rivotril', 'Clonotril'], doses: ['0,25 mg', '0,5 mg', '1 mg', '2 mg'] },
  { name: 'Alprazolam', brands: ['Frontal', 'Apraz'], doses: ['0,25 mg', '0,5 mg', '1 mg', '2 mg'] },
  { name: 'Diazepam', brands: ['Valium'], doses: ['2 mg', '5 mg', '10 mg'] },
  { name: 'Amitriptilina', brands: ['Amytril'], doses: ['10 mg', '25 mg', '50 mg'] },
  { name: 'Quetiapina', brands: ['Seroquel'], doses: ['25 mg', '50 mg', '100 mg'] },
  { name: 'Risperidona', brands: ['Risperdal'], doses: ['1 mg', '2 mg', '3 mg'] },
  { name: 'Litio', brands: ['Carbolitium'], doses: ['300 mg'] },
  { name: 'Pregabalina', brands: ['Lyrica'], doses: ['75 mg', '150 mg'] },
  { name: 'Gabapentina', brands: ['Neurontin'], doses: ['300 mg', '400 mg'] },
  // ── Antibióticos / antifúngicos ──
  { name: 'Amoxicilina', brands: ['Amoxil', 'Novamox'], doses: ['250 mg', '500 mg'] },
  { name: 'Amoxicilina + clavulanato', brands: ['Clavulin', 'Augmentin'], doses: ['500 mg', '875 mg'] },
  { name: 'Azitromicina', brands: ['Azitromicina', 'Zitromax'], doses: ['500 mg'] },
  { name: 'Claritromicina', brands: ['Klaricid'], doses: ['250 mg', '500 mg'] },
  { name: 'Ciprofloxacino', brands: ['Cipro'], doses: ['250 mg', '500 mg', '750 mg'] },
  { name: 'Levofloxacino', brands: ['Levaquin'], doses: ['500 mg'] },
  { name: 'Cefalexina', brands: ['Keforal'], doses: ['250 mg', '500 mg'] },
  { name: 'Fluconazol', brands: ['Fluconaz', 'Zoltec'], doses: ['150 mg'] },
  // ── Outros crônicos comuns ──
  { name: 'Sulfato ferroso', brands: ['Ferro'], doses: ['324 mg', '40 mg (gotas)'] },
  { name: 'Colécalciferol', brands: ['Vitamina D'], doses: [] },
  { name: 'Tamsulosina', brands: ['Secotex'], doses: ['0,4 mg'] },
  { name: 'Finasterida', brands: ['Proscar', 'Finasterida'], doses: ['1 mg', '5 mg'] },
  { name: 'Sildenafila', brands: ['Viagra'], doses: ['25 mg', '50 mg'] },
  { name: 'Tadalafila', brands: ['Cialis'], doses: ['5 mg', '20 mg'] },
  { name: 'Metoclopramida', brands: ['Plasil'], doses: ['10 mg'] },
  { name: 'Ondansetrona', brands: ['Vonau'], doses: ['4 mg', '8 mg'] },
  { name: 'Sinvastatina + ezetimiba', brands: ['Vytorin'], doses: ['10/10 mg', '10/20 mg'] },
  { name: 'Alopurinol', brands: ['Zyloric'], doses: ['100 mg', '200 mg', '300 mg'] },
  { name: 'Colchicina', brands: ['Colchi'], doses: ['0,5 mg'] },
  { name: 'Hidroxicloroquina', brands: ['Quensyl'], doses: ['400 mg'] },
  { name: 'Metotrexato', brands: ['Metotrexato'], doses: ['2,5 mg'] },
  { name: 'Ciclosporina', brands: ['Sandimmun'], doses: ['25 mg', '50 mg', '100 mg'] },
  { name: 'Mirabegrona', brands: ['Betmiga'], doses: ['25 mg', '50 mg'] },
  { name: 'Solifenacina', brands: ['Vesicare'], doses: ['5 mg', '10 mg'] },
  { name: 'Cetirizina', brands: ['Zyrtec', 'Zina'], doses: ['10 mg'] },
  { name: 'Loratadina', brands: ['Claritin'], doses: ['10 mg'] },
  { name: 'Montelucaste', brands: ['Singulair'], doses: ['5 mg', '10 mg'] },
  { name: 'Budesonida', brands: ['Pulmicort'], doses: [] },
  { name: 'Salbutamol', brands: ['Aerolin'], doses: [] },
  { name: 'Eformoterol+budesonida', brands: ['Symbicort'], doses: [] },
  { name: 'Bromazepam', brands: ['Lexotan'], doses: ['3 mg', '6 mg'] },
  { name: 'Zolpidem', brands: ['Stilnox'], doses: ['5 mg', '10 mg'] },
  { name: 'Eszopiclona', brands: ['Lunesta'], doses: ['2 mg', '3 mg'] },
  { name: 'Memantina', brands: ['Ebixa'], doses: ['10 mg'] },
  { name: 'Donepezila', brands: ['Aricept'], doses: ['5 mg', '10 mg'] },
  { name: 'Rivastigmina', brands: ['Exelon'], doses: [] },
  { name: 'Levodopa + benserazida', brands: ['Prolopa'], doses: [] },
  { name: 'Carbidopa + levodopa', brands: ['Sinemet'], doses: [] },
  { name: 'Pramipexol', brands: ['Mirapex'], doses: [] },
  { name: 'Entacapona', brands: ['Comtan'], doses: [] },
  { name: 'Topiramato', brands: ['Topamax'], doses: ['25 mg', '50 mg', '100 mg'] },
  { name: 'Carbamazepina', brands: ['Tegretol'], doses: ['200 mg'] },
  { name: 'Ácido valproico', brands: ['Depakote', 'Depakene'], doses: ['250 mg', '500 mg'] },
  { name: 'Lamotrigina', brands: ['Lamictal'], doses: ['25 mg', '50 mg', '100 mg'] },
  { name: 'Levetiracetam', brands: ['Keppra'], doses: ['250 mg', '500 mg', '1000 mg'] },
  { name: 'Fenitoína', brands: ['Hidantal'], doses: ['100 mg'] },
  { name: 'Bissacodil', brands: ['Dulcolax'], doses: ['5 mg'] },
  { name: 'Lactulose', brands: ['Lactulose'], doses: [] },
  { name: 'Ondansetrona + vitamina', brands: [], doses: [] },
  { name: 'Potássio', brands: ['Cloreto de potássio'], doses: [] },
  { name: 'Cálcio', brands: ['Cálcio + vitamina D'], doses: [] },
  { name: 'Polivitamínico', brands: ['Centrum', 'Redoxon'], doses: [] },
  { name: 'Ómega 3', brands: ['Ômega 3'], doses: [] },
  { name: 'Isotretinoína', brands: ['Roacutan'], doses: ['10 mg', '20 mg'] },
  { name: 'Finasterida tópica', brands: [], doses: [] },
  { name: 'Minoxidil', brands: ['Kirkland'], doses: [] },
];

/** Chips de 1-toque no vazio/adição — os mais usados no Brasil (crônicos). */
export const QUICK_MEDS = ['Ácido acetilsalicílico', 'Omeprazol', 'Metformina', 'Levotiroxina', 'Losartana', 'Sinvastatina', 'Paracetamol', 'Ibuprofeno', 'Clonazepam', 'Sertralina', 'Pantoprazol', 'Hidroclorotiazida'];

/** Busca: casa por genérico OU marca, sem acento, a partir de 2 letras. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function searchMeds(query: string, limit = 8): MedEntry[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const starts: MedEntry[] = []; const contains: MedEntry[] = [];
  for (const m of MEDS_BR) {
    const hay = [norm(m.name), ...(m.brands ?? []).map(norm)];
    if (hay.some((h) => h.startsWith(q))) starts.push(m);
    else if (hay.some((h) => h.includes(q))) contains.push(m);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
