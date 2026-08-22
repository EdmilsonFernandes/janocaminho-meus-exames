/**
 * Catálogo local de medicamentos — bootstrap + refresh 2h.
 *
 * BOOT (1ª vez): varre o dicionário MEDS_BR (espelhado do front) → consulta VTEX
 * → popula medication_catalog com foto + preço + EAN da melhor oferta.
 * CRON 2h: refresha só o que passou de 2h (prioriza os mais usados).
 *
 * O combobox do front busca aqui (GET /medications/catalog?q=levo) — instantâneo.
 */
import { prisma } from '../prisma';
import { pagueMenosProvider } from './providers/pagueMenos';
import { normDrug } from '../utils/interactions';
import { priceProvidersEnabled } from './provider';

/** Espelho do dicionário do front (113 remédios) — mantido aqui pro bootstrap server-side. */
const DICT: { name: string; brands?: string[] }[] = [
  { name: 'Losartana Potássica', brands: ['Cozaar'] }, { name: 'Enalapril', brands: ['Renitec'] },
  { name: 'Amlodipina', brands: ['Norvasc'] }, { name: 'Hidroclorotiazida' }, { name: 'Furosemida', brands: ['Lasix'] },
  { name: 'Espironolactona', brands: ['Aldactone'] }, { name: 'Atenolol', brands: ['Atenol'] }, { name: 'Metoprolol', brands: ['Seloken'] },
  { name: 'Carvedilol', brands: ['Coreg'] }, { name: 'Propranolol', brands: ['Inderal'] }, { name: 'Digoxina', brands: ['Lanoxin'] },
  { name: 'Amiodarona', brands: ['Coraldin'] }, { name: 'Varfarina', brands: ['Marevan'] },
  { name: 'Ácido acetilsalicílico', brands: ['AAS', 'Aspirina', 'Cardioaspirina'] }, { name: 'Clopidogrel', brands: ['Plavix'] },
  { name: 'Rivaroxabana', brands: ['Xarelto'] }, { name: 'Apixabana', brands: ['Eliquis'] },
  { name: 'Metformina', brands: ['Glifage'] }, { name: 'Glibenclamida', brands: ['Daonil'] }, { name: 'Glimepirida', brands: ['Amaryl'] },
  { name: 'Sitagliptina', brands: ['Januvia'] }, { name: 'Sinvastatina', brands: ['Sinvacor'] },
  { name: 'Atorvastatina', brands: ['Citalor'] }, { name: 'Rosuvastatina', brands: ['Crestor'] },
  { name: 'Omeprazol', brands: ['Losec'] }, { name: 'Pantoprazol', brands: ['Pantotec'] }, { name: 'Esomeprazol', brands: ['Nexium'] },
  { name: 'Levotiroxina', brands: ['Levoid', 'Puran T4', 'Synthroid', 'Euthyrox'] }, { name: 'Prednisona', brands: ['Meticorten'] },
  { name: 'Paracetamol', brands: ['Tylenol'] }, { name: 'Dipirona', brands: ['Novalgina'] },
  { name: 'Ibuprofeno', brands: ['Advil', 'Alivium'] }, { name: 'Diclofenaco', brands: ['Voltaren'] },
  { name: 'Naproxeno', brands: ['Flanax'] }, { name: 'Tramadol', brands: ['Tramal'] }, { name: 'Codeína' },
  { name: 'Sertralina', brands: ['Zoloft'] }, { name: 'Fluoxetina', brands: ['Prozac'] },
  { name: 'Escitalopram', brands: ['Lexapro'] }, { name: 'Paroxetina', brands: ['Aropax'] },
  { name: 'Venlafaxina', brands: ['Efexor'] }, { name: 'Bupropiona', brands: ['Wellbutrin'] },
  { name: 'Clonazepam', brands: ['Rivotril'] }, { name: 'Alprazolam', brands: ['Frontal'] },
  { name: 'Diazepam', brands: ['Valium'] }, { name: 'Amitriptilina', brands: ['Amytril'] },
  { name: 'Quetiapina', brands: ['Seroquel'] }, { name: 'Litio', brands: ['Carbolitium'] },
  { name: 'Pregabalina', brands: ['Lyrica'] }, { name: 'Gabapentina', brands: ['Neurontin'] },
  { name: 'Amoxicilina', brands: ['Amoxil'] }, { name: 'Azitromicina' }, { name: 'Claritromicina', brands: ['Klaricid'] },
  { name: 'Ciprofloxacino', brands: ['Cipro'] }, { name: 'Cefalexina', brands: ['Keforal'] },
  { name: 'Fluconazol', brands: ['Fluconaz'] }, { name: 'Sulfato ferroso', brands: ['Ferro'] },
  { name: 'Tamsulosina', brands: ['Secotex'] }, { name: 'Finasterida', brands: ['Proscar'] },
  { name: 'Metoclopramida', brands: ['Plasil'] }, { name: 'Ondansetrona', brands: ['Vonau'] },
  { name: 'Alopurinol', brands: ['Zyloric'] }, { name: 'Metotrexato' }, { name: 'Ciclosporina', brands: ['Sandimmun'] },
  { name: 'Cetirizina', brands: ['Zyrtec'] }, { name: 'Loratadina', brands: ['Claritin'] },
  { name: 'Montelucaste', brands: ['Singulair'] }, { name: 'Bromazepam', brands: ['Lexotan'] },
  { name: 'Zolpidem', brands: ['Stilnox'] }, { name: 'Memantina', brands: ['Ebixa'] },
  { name: 'Donepezila', brands: ['Aricept'] }, { name: 'Topiramato', brands: ['Topamax'] },
  { name: 'Carbamazepina', brands: ['Tegretol'] }, { name: 'Ácido valproico', brands: ['Depakote'] },
  { name: 'Lamotrigina', brands: ['Lamictal'] }, { name: 'Levetiracetam', brands: ['Keppra'] },
  { name: 'Bissacodil', brands: ['Dulcolax'] }, { name: 'Isotretinoína', brands: ['Roacutan'] },
];

/** BOOT: popula o catálogo se vazio (1× — depois só o cron refresha). */
export async function bootstrapCatalog(): Promise<{ created: number; withPrice: number }> {
  const existing = await prisma.medicationCatalogEntry.count();
  if (existing > 0) { console.log(`[catalog] já tem ${existing} entradas — pulando bootstrap`); return { created: 0, withPrice: 0 }; }
  let created = 0, withPrice = 0;
  for (const med of DICT) {
    const ingredient = normDrug(med.name);
    try {
      const offers = await pagueMenosProvider.search({ medicationKey: null, activeIngredient: med.name, dosageValue: undefined, dosageUnit: undefined, form: 'CP' });
      const best = offers[0];
      await prisma.medicationCatalogEntry.create({
        data: {
          name: med.name, activeIngredient: ingredient,
          brands: med.brands ?? [],
          doses: [],
          photoUrl: best?.imageUrl ?? null,
          priceCents: best?.priceCents ?? null,
          productName: best?.productName ?? null,
          productUrl: best?.url ?? null,
          pharmacy: best?.pharmacy ?? null,
          ean: best?.ean ?? null,
          offersCount: offers.length,
          vtexQuery: med.name,
          lastRefreshedAt: new Date(),
        },
      }).catch(() => {}); // duplicate → skip
      created++; if (best) withPrice++;
      await new Promise((r) => setTimeout(r, 300)); // rate-limit respeitoso
    } catch { /* VTEX falhou pra este — segue */ }
  }
  console.log(`[catalog] bootstrap: ${created} entradas (${withPrice} com preço)`);
  return { created, withPrice };
}

/** CRON: refresha entradas com lastRefreshedAt > 2h (ou null). */
export async function refreshCatalog(): Promise<{ refreshed: number }> {
  if (!priceProvidersEnabled()) return { refreshed: 0 };
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const stale = await prisma.medicationCatalogEntry.findMany({
    where: { OR: [{ lastRefreshedAt: { lt: cutoff } }, { lastRefreshedAt: null }] },
    take: 20, // batch pequeno por tick (não martelar a fonte)
  });
  let refreshed = 0;
  for (const entry of stale) {
    try {
      const offers = await pagueMenosProvider.search({ medicationKey: null, activeIngredient: entry.name, dosageValue: undefined, dosageUnit: undefined, form: 'CP' });
      const best = offers[0];
      await prisma.medicationCatalogEntry.update({
        where: { id: entry.id },
        data: {
          photoUrl: best?.imageUrl ?? entry.photoUrl,
          priceCents: best?.priceCents ?? entry.priceCents,
          productName: best?.productName ?? entry.productName,
          ean: best?.ean ?? entry.ean,
          offersCount: offers.length,
          lastRefreshedAt: new Date(),
        },
      });
      refreshed++;
      await new Promise((r) => setTimeout(r, 400));
    } catch { /* segue */ }
  }
  return { refreshed };
}

export function startCatalogJob(): void {
  const boot = () => { void bootstrapCatalog().catch((e) => console.warn('[catalog] boot:', (e as Error).message?.slice(0, 80))); };
  setTimeout(boot, 15_000); // 15s após boot (deixa o servidor subir)
  setInterval(() => { void refreshCatalog().catch(() => {}); }, 2 * 60 * 60 * 1000); // 2h
}
