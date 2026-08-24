/**
 * Provider Drogaria Pacheco — API PÚBLICA VTEX (mesma plataforma da Pague Menos).
 * Validada em campo (2026-08-24): Paracetamol 750mg → 5 produtos, R$ 5,83-13,29, com foto.
 *
 * O Grupo DPSP (Drogaria Pacheco + Drogasil) é uma das maiores redes do Brasil.
 * A Pacheco expõe a VTEX catalog_system API sem proteção (diferente da Drogasil
 * que usa Akamai + client-side rendering).
 */
import type { MedicationPriceProvider, PriceOffer } from '../provider';
import type { NormalizedMedication } from '../normalize';
import { normDrug } from '../../utils/interactions';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.drogariaspacheco.com.br/api/catalog_system/pub/products/search/';

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

async function vtexSearch(query: string): Promise<VtexProduct[]> {
  const r = await fetch(`${BASE}?ft=${encodeURIComponent(query)}&_from=1&_to=12`, {
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Pacheco respondeu ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

export const pachecoProvider: MedicationPriceProvider = {
  name: 'pacheco',
  async search(n: NormalizedMedication): Promise<PriceOffer[]> {
    if (!n.activeIngredient) return [];
    const dose = n.dosageValue ? ` ${n.dosageValue}${(n.dosageUnit || 'mg').toLowerCase()}` : '';
    const query = `${n.activeIngredient}${dose}`.trim();
    const products = await vtexSearch(query);
    return products
      .map((p): PriceOffer | null => {
        const item = p.items?.[0];
        const offer = item?.sellers?.[0]?.commertialOffer;
        const price = offer?.Price;
        const name = item?.nameComplete || p.productName || '';
        if (!price || price <= 0 || !offer?.IsAvailable) return null;
        if (!matches(name, n)) return null;
        return {
          pharmacy: 'Drogaria Pacheco',
          productName: name.slice(0, 140),
          priceCents: Math.round(price * 100),
          url: p.link || `https://www.drogariaspacheco.com.br/${p.linkText || ''}`,
          imageUrl: item?.images?.[0]?.imageUrl ?? null,
          ean: item?.ean ?? null,
        };
      })
      .filter((o): o is PriceOffer => o !== null)
      .sort((a, b) => a.priceCents - b.priceCents)
      .slice(0, 6);
  },
};
