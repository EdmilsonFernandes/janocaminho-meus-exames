/**
 * Provider VTEX DINÂMICO — lê as farmácias ATIVAS da tabela pharmacy_configs.
 * Admin adiciona/remove farmácia → o worker automaticamente inclui/exclui.
 * Zero deploy necessário pra adicionar nova farmácia.
 */
import { prisma } from '../../prisma';
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
  const r = await fetch(`https://${host}/api/catalog_system/pub/products/search/?ft=${encodeURIComponent(query)}&_from=1&_to=5`, {
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`${host} respondeu ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

/** SEED: popula pharmacy_configs se vazio (as 9 farmácias atuais). */
export async function seedPharmacies(): Promise<void> {
  const count = await prisma.pharmacyConfig.count();
  if (count > 0) return;
  const seeds = [
    { name: 'Pague Menos', slug: 'pague-menos', hostname: 'www.paguemenos.com.br', color: '#d32f2f', sortOrder: 1 },
    { name: 'Drogaria Pacheco', slug: 'pacheco', hostname: 'www.drogariaspacheco.com.br', color: '#1565c0', sortOrder: 2 },
    { name: 'Farmácias São João', slug: 'sao-joao', hostname: 'www.farmaciassaojoao.com.br', color: '#2e7d32', sortOrder: 3 },
    { name: 'Drogaria São Paulo', slug: 'sao-paulo', hostname: 'www.drogariasaopaulo.com.br', color: '#c62828', sortOrder: 4 },
    { name: 'Drogaria Globo', slug: 'globo', hostname: 'www.drogariaglobo.com.br', color: '#6a1b9a', sortOrder: 5 },
    { name: 'Nova Esperança', slug: 'nova-esperanca', hostname: 'www.drogarianovaesperanca.com.br', color: '#e65100', sortOrder: 6 },
    { name: 'Santa Lucia', slug: 'santa-lucia', hostname: 'www.santaluciadrogarias.com.br', color: '#00695c', sortOrder: 7 },
    { name: 'Farmais', slug: 'farmais', hostname: 'www.farmais.com.br', color: '#283593', sortOrder: 8 },
    { name: 'Coop Drogaria', slug: 'coop', hostname: 'www.coopdrogaria.com.br', color: '#37474f', sortOrder: 9 },
  ];
  await prisma.pharmacyConfig.createMany({ data: seeds }).catch(() => {});
  console.log(`[pharmacies] seed: ${seeds.length} farmácias`);
}

/** MULTI-PROVIDER dinâmico: lê farmácias ativas da tabela → busca em todas. */
export const vtexDynamicProvider: MedicationPriceProvider = {
  name: 'vtex-dynamic',
  async search(n: NormalizedMedication): Promise<PriceOffer[]> {
    if (!n.activeIngredient) return [];
    const configs = await prisma.pharmacyConfig.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    if (!configs.length) return [];

    const dose = n.dosageValue ? ` ${n.dosageValue}${(n.dosageUnit || 'mg').toLowerCase()}` : '';
    const query = `${n.activeIngredient}${dose}`.trim();

    const results = await Promise.allSettled(
      configs.map(async (config) => {
        const products = await vtexFetch(config.hostname, query);
        return products
          .map((p): PriceOffer | null => {
            const item = p.items?.[0];
            const offer = item?.sellers?.[0]?.commertialOffer;
            const price = offer?.Price;
            const name = item?.nameComplete || p.productName || '';
            if (!price || price <= 0 || !offer?.IsAvailable) return null;
            if (!matches(name, n)) return null;
            return {
              pharmacy: config.name,
              productName: name.slice(0, 140),
              priceCents: Math.round(price * 100),
              url: p.link || `https://${config.hostname}/`,
              imageUrl: item?.images?.[0]?.imageUrl ?? null,
              ean: item?.ean ?? null,
            };
          })
          .filter((o): o is PriceOffer => o !== null)
          .slice(0, 4); // 4 por farmácia (com 9 = até 36)
      }),
    );

    const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const seen = new Set<string>();
    return all
      .filter((o) => { const k = o.url || o.productName; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.priceCents - b.priceCents)
      .slice(0, 15);
  },
};
