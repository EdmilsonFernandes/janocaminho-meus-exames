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

/** Tokens úteis do ativo — SÓ ALFABÉTICOS ≥4 (número nunca é token: "0,25" casava
 * "6x0,25mm" no nome de uma SERINGA — bug Ozempic). */
const STOP_TOKENS = new Set(['DE', 'DO', 'DA', 'DAS', 'DOS', 'E', 'COM', 'MONO']);
function activeTokens(activeIngredient: string): string[] {
  const tokens = normDrug(activeIngredient).split(' ').filter((t) => /^[A-Z]{4,}$/.test(t) && !STOP_TOKENS.has(t));
  return tokens.length ? tokens : [normDrug(activeIngredient)];
}

/** Nome casa com o que buscamos? (ativo + dose; e embalagem quando conhecida) */
function matches(name: string, n: NormalizedMedication, opts: { loosePack?: boolean; looseDose?: boolean } = {}): boolean {
  const p = normDrug(name);
  if (!activeTokens(n.activeIngredient).some((t) => p.includes(t))) return false;
  // Dígitos com pontuação PRESERVADA + GUARD ML (volume "0,5ml" ≠ dose "0,5mg").
  const raw = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const digitAt = (num: number | string) => new RegExp(`(^|[^,.\\d])${num}(\\D|$)`).test(raw);
  const unitIsMl = (n.dosageUnit || 'MG') === 'ML';
  const followedByMl = (num: number | string) => new RegExp(`(^|[^,.\\d])${num}\\s*ML`).test(raw);
  if (!opts.looseDose && n.dosageValue != null) {
    // Borda obrigatória: "25" NÃO casa "125mcg" nem "12,5mg". O ponto da regex
    // cobre vírgula decimal (dose 0.25 casa "0,25").
    if (!digitAt(n.dosageValue)) return false;
    if (!unitIsMl && followedByMl(n.dosageValue)) return false;
  }
  // Embalagem é preferência: pack default 30 assume comprimido — injetável vem
  // em "4 Canetas" e nunca casa. loosePack ignora a embalagem (só se estrito zerou).
  if (!opts.loosePack && n.packQty != null && !digitAt(n.packQty)) return false;
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

    const toOffers = (products: VtexProduct[], opts: { loosePack?: boolean; looseDose?: boolean } = {}) =>
      products
        .map((p): (PriceOffer & { sortKey: number }) | null => {
          const item = p.items?.[0];
          const offer = item?.sellers?.[0]?.commertialOffer;
          const price = offer?.Price;
          const name = item?.nameComplete || p.productName || '';
          if (!price || price <= 0 || !offer?.IsAvailable) return null;
          if (!matches(name, n, opts)) return null;
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

    const run = (opts: { loosePack?: boolean; looseDose?: boolean } = {}) => {
      // (async dentro — devolve promessa com os 3 estágios)
      return (async () => {
        let products = await vtexSearch(query);
        let offers = toOffers(products, opts);
        // Complementa com SÓ a 1ª palavra quando veio pouco: full-text multi-palavra
        // underperforma (fuzzy-miss — "BARISTAR SABOR BAUNILHA" sem o Baristar).
        const firstWord = n.activeIngredient.split(' ')[0] ?? '';
        if (offers.length < 3 && firstWord.length >= 4 && firstWord !== query) {
          products = await vtexSearch(firstWord);
          const seen = new Set(offers.map((o) => o.url));
          offers = [...offers, ...toOffers(products, opts).filter((o) => !seen.has(o.url))];
        }
        // Zerou? embalagem era chute (default 30 ≠ "4 Canetas" de injetável) —
        // re-matcha os últimos produtos sem filtro de pack (sem refetch).
        if (offers.length === 0 && n.packQty != null) {
          offers = toOffers(products, { ...opts, loosePack: true });
        }
        return offers;
      })();
    };

    let offers = await run();
    if (offers.length === 0) offers = await run({ loosePack: true, looseDose: true }); // família
    return offers
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(0, 8)
      .map(({ sortKey, ...o }) => { void sortKey; return o; });
  },
};
