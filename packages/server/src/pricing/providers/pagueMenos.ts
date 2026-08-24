/**
 * Provider Pague Menos — API PÚBLICA de catálogo da plataforma VTEX (a loja deles).
 * `catalog_system/pub` é a API nativa de vitrine do VTEX: pública por design, sem
 * anti-bot, JSON estruturado. Validada em campo (2026-08-22): Losartana 50mg genérico
 * cx30 = R$ 4,19, com EAN + foto + princípio ativo + flag genérico + registro MS.
 *
 * Este é o PADRÃO do que uma fonte boa parece: dispensa scraping, dispensa challenge,
 * e ainda devolve as chaves de normalização (EAN). Outras lojas VTEX entram como
 * siblings (provider por loja) sem mudar nada no worker.
 *
 * Privacidade: recebe somente produto/dose/embalagem — nada do paciente sai.
 */
import type { MedicationPriceProvider, PriceOffer } from '../provider';
import type { NormalizedMedication } from '../normalize';
import { normDrug } from '../../utils/interactions';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.paguemenos.com.br/api/catalog_system/pub/products/search/';

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

/** Nome casa com o que buscamos? (ativo + dose; e embalagem quando conhecida) */
function matches(name: string, n: NormalizedMedication): boolean {
  const p = normDrug(name);
  const ingredient = normDrug(n.activeIngredient).split(' ')[0];
  if (!p.includes(ingredient)) return false;
  if (n.dosageValue != null) {
    // Borda de dígito obrigatória: "25" NÃO casa "125mcg" (substring include
    // deixava dose errada vazar). O ponto da regex cobre vírgula (0.25→"0,25").
    if (!new RegExp(`(^|\\D)${n.dosageValue}(\\D|$)`).test(p)) return false;
  }
  // Embalagem conhecida → prioriza a apresentação certa (30 ≠ 60 comprimidos)
  if (n.packQty != null && !new RegExp(`(^|\\D)${n.packQty}(\\D|$)`).test(p)) return false;
  return true;
}

async function vtexSearch(query: string): Promise<VtexProduct[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const r = await fetch(`${BASE}?ft=${encodeURIComponent(query)}&_from=1&_to=12`, {
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'pt-BR' },
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Pague Menos respondeu ${r.status}`);
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } finally { clearTimeout(timer); }
}

export const pagueMenosProvider: MedicationPriceProvider = {
  name: 'pague-menos',
  async search(n: NormalizedMedication): Promise<PriceOffer[]> {
    if (!n.activeIngredient) return [];
    const dose = n.dosageValue ? ` ${n.dosageValue}${(n.dosageUnit || 'mg').toLowerCase()}` : '';
    const query = `${n.activeIngredient}${dose}`.trim();

    const toOffers = (products: VtexProduct[]) =>
      products
        .map((p): (PriceOffer & { sortKey: number }) | null => {
          const item = p.items?.[0];
          const offer = item?.sellers?.[0]?.commertialOffer;
          const price = offer?.Price;
          const name = item?.nameComplete || p.productName || '';
          if (!price || price <= 0 || !offer?.IsAvailable) return null;
          if (!matches(name, n)) return null;
          return {
            pharmacy: 'Pague Menos',
            productName: name.slice(0, 140),
            priceCents: Math.round(price * 100),
            url: p.link || `https://www.paguemenos.com.br/${p.linkText || ''}`,
            imageUrl: item?.images?.[0]?.imageUrl ?? null,
            ean: item?.ean ?? null,
            sortKey: Math.round(price * 100),
          };
        })
        .filter((o): o is PriceOffer & { sortKey: number } => o !== null);

    let offers = toOffers(await vtexSearch(query));
    // Fallback: full-text multi-palavra pode falhar (fuzzy que não casa — ex.
    // "BARISTAR SABOR BAUNILHA" não retorna o Baristar). Tenta SÓ a 1ª palavra.
    if (offers.length === 0) {
      const firstWord = n.activeIngredient.split(' ')[0] ?? '';
      if (firstWord.length >= 4 && firstWord !== query) {
        offers = toOffers(await vtexSearch(firstWord));
      }
    }
    return offers
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(0, 8)
      .map(({ sortKey, ...o }) => { void sortKey; return o; });
  },
};
