/**
 * Provider VTEX GENÉRICO — uma classe, N farmácias. Cada farmácia brasileira na
 * plataforma VTEX expõe a mesma API pública (catalog_system/pub). Só muda o hostname.
 *
 * Ativas (validadas 2026-08-24):
 * - Pague Menos    (RD Saúde — nacional)
 * - Drogaria Pacheco (Grupo DPSP — nacional)
 * - São João       (Grupo São João — Sul)
 * - Nova Esperança (Norte/Nordeste)
 * - Drogaria Globo (Nacional)
 */
import type { MedicationPriceProvider, PriceOffer } from '../provider';
import type { NormalizedMedication } from '../normalize';
import { normDrug } from '../../utils/interactions';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface VtexProduct {
  productName?: string;
  link?: string;
  linkText?: string;
  items?: {
    nameComplete?: string;
    ean?: string;
    images?: { imageUrl?: string }[];
    sellers?: { commertialOffer?: { Price?: number; IsAvailable?: boolean } }[];
  }[];
}

function matches(name: string, n: NormalizedMedication): boolean {
  const p = normDrug(name);
  const ingredient = normDrug(n.activeIngredient).split(' ')[0];
  if (!p.includes(ingredient)) return false;
  if (n.dosageValue != null) {
    const v = String(n.dosageValue).replace('.', ',');
    if (!new RegExp(`(^|\\D)${n.dosageValue}(\\D|$)`).test(p) && !p.includes(v)) return false;
  }
  if (n.packQty != null && !new RegExp(`(^|\\D)${n.packQty}(\\D|$)`).test(p)) return false;
  return true;
}

async function vtexFetch(host: string, query: string): Promise<VtexProduct[]> {
  const r = await fetch(`https://${host}/api/catalog_system/pub/products/search/?ft=${encodeURIComponent(query)}&_from=1&_to=8`, {
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`${host} respondeu ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

/** Cria um provider VTEX para uma farmácia específica. */
function makeVtexProvider(host: string, pharmacyName: string, shortName: string): MedicationPriceProvider {
  return {
    name: shortName,
    async search(n: NormalizedMedication): Promise<PriceOffer[]> {
      if (!n.activeIngredient) return [];
      const dose = n.dosageValue ? ` ${n.dosageValue}${(n.dosageUnit || 'mg').toLowerCase()}` : '';
      const query = `${n.activeIngredient}${dose}`.trim();
      const products = await vtexFetch(host, query);
      return products
        .map((p): PriceOffer | null => {
          const item = p.items?.[0];
          const offer = item?.sellers?.[0]?.commertialOffer;
          const price = offer?.Price;
          const name = item?.nameComplete || p.productName || '';
          if (!price || price <= 0 || !offer?.IsAvailable) return null;
          if (!matches(name, n)) return null;
          return {
            pharmacy: pharmacyName,
            productName: name.slice(0, 140),
            priceCents: Math.round(price * 100),
            url: p.link || `https://${host}/${p.linkText || ''}`,
            imageUrl: item?.images?.[0]?.imageUrl ?? null,
            ean: item?.ean ?? null,
          };
        })
        .filter((o): o is PriceOffer => o !== null)
        .sort((a, b) => a.priceCents - b.priceCents)
        .slice(0, 5); // 5 por farmácia (com 5 farmácias = até 25 ofertas)
    },
  };
}

export const pagueMenosProvider = makeVtexProvider('www.paguemenos.com.br', 'Pague Menos', 'pague-menos');
export const pachecoProvider = makeVtexProvider('www.drogariaspacheco.com.br', 'Drogaria Pacheco', 'pacheco');
export const saoJoaoProvider = makeVtexProvider('www.farmaciassaojoao.com.br', 'Farmácias São João', 'sao-joao');
export const novaEsperancaProvider = makeVtexProvider('www.drogarianovaesperanca.com.br', 'Nova Esperança', 'nova-esperanca');
export const globoProvider = makeVtexProvider('www.drogariaglobo.com.br', 'Drogaria Globo', 'globo');
export const santaLuciaProvider = makeVtexProvider('www.santaluciadrogarias.com.br', 'Santa Lucia', 'santa-lucia');

/** MULTI-PROVIDER: 6 farmácias VTEX em paralelo — o "Ver preços" vira um marketplace real. */
export const vtexMultiProvider: MedicationPriceProvider = {
  name: 'vtex-multi',
  async search(n: NormalizedMedication): Promise<PriceOffer[]> {
    const providers = [pagueMenosProvider, pachecoProvider, saoJoaoProvider, novaEsperancaProvider, globoProvider, santaLuciaProvider];
    const results = await Promise.allSettled(providers.map((p) => p.search(n)));
    const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const seen = new Set<string>();
    return all
      .filter((o) => { const k = o.url || o.productName; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.priceCents - b.priceCents)
      .slice(0, 15);
  },
};
