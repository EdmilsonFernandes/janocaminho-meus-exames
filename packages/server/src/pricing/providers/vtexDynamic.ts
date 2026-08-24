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

/** Tokens úteis do princípio ativo — "CLORIDRATO DE SIBUTRAMINA MONOIDRATADO" →
 * [CLORIDRATO, SIBUTRAMINA, MONOIDRATADO]. Qualquer um presente no nome conta
 * (a 1ª palavra sozinha já era; para sais a 1ª é "CLORIDRATO"/"ACETATO" genérico). */
const STOP_TOKENS = new Set(['DE', 'DO', 'DA', 'DAS', 'DOS', 'E', 'COM', 'MONO']);
export function activeTokens(activeIngredient: string): string[] {
  const tokens = normDrug(activeIngredient).split(' ').filter((t) => t.length >= 4 && !STOP_TOKENS.has(t));
  return tokens.length ? tokens : [normDrug(activeIngredient)];
}

export function matches(name: string, n: NormalizedMedication, opts: { loosePack?: boolean; looseDose?: boolean } = {}): boolean {
  const p = normDrug(name);
  if (!activeTokens(n.activeIngredient).some((t) => p.includes(t))) return false;
  // Checagem de dígitos no texto com pontuação PRESERVADA (normDrug troca "," por
  // espaço e "12,5mg" viraria "12 5mg" — o "5" ficaria solto e casava dose 5).
  const raw = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const digitAt = (num: number | string) => new RegExp(`(^|[^,.\\d])${num}(\\D|$)`).test(raw);
  // SUPLEMENTO: se o "dosage" é igual ao packQty (ex.: "30 Cápsulas" → dose=30, pack=30),
  // é a MESMA informação duplicada pelo parser — não filtrar por dose (o nome tem "30 Cápsulas",
  // não "30MG"). Sem isto, Baristar/Dipirona 500+20cp nunca casam.
  const isSupplementDose = n.dosageValue != null && n.packQty != null && n.dosageValue === n.packQty;
  if (!isSupplementDose && !opts.looseDose && n.dosageValue != null) {
    // Borda obrigatória: "25" NÃO casa "125mcg" nem "12,5mg". O ponto da regex
    // cobre vírgula decimal (dose 0.25 casa "0,25").
    if (!digitAt(n.dosageValue)) return false;
  }
  // EMBALAGEM é preferência, não lei: o default pack=30 assume comprimido — injetável
  // vem em "4 Canetas/Doses" (Mounjaro) e NUNCA teria "30" no nome. loosePack
  // (só quando o filtro estrito zerou) ignora a embalagem e mantém ativo+dose.
  if (!opts.loosePack && n.packQty != null && !digitAt(n.packQty)) return false;
  return true;
}

async function vtexFetch(host: string, query: string, to = 5): Promise<VtexProduct[]> {
  const r = await fetch(`https://${host}/api/catalog_system/pub/products/search/?ft=${encodeURIComponent(query)}&_from=1&_to=${to}`, {
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

    // SUPLEMENTO: se dose == pack (ex.: "30 Cápsulas" → dose=30, pack=30), NÃO incluir
    // a dose na busca — o produto VTEX diz "30 Cápsulas", não "30mg". Buscar com "30mg"
    // retornava 0 resultados (Baristar).
    const isSupplement = n.dosageValue != null && n.packQty != null && n.dosageValue === n.packQty;
    const dose = !isSupplement && n.dosageValue ? ` ${n.dosageValue}${(n.dosageUnit || 'mg').toLowerCase()}` : '';
    // também limpar o número do pack que ficou colado no activeIngredient
    // ("BARISTAR SABOR BAUNILHA 30" → "BARISTAR SABOR BAUNILHA")
    const cleanIngredient = isSupplement
      ? n.activeIngredient.replace(/\s+\d+$/, '') // remove número solto no fim
      : n.activeIngredient;
    const query = `${cleanIngredient}${dose}`.trim();

    const firstWord = query.split(' ')[0] ?? '';
    const matchOffers = (products: VtexProduct[], config: { name: string; hostname: string }, opts: { loosePack?: boolean; looseDose?: boolean } = {}): PriceOffer[] =>
      products
        .map((p): PriceOffer | null => {
          const item = p.items?.[0];
          const offer = item?.sellers?.[0]?.commertialOffer;
          const price = offer?.Price;
          const name = item?.nameComplete || p.productName || '';
          if (!price || price <= 0 || !offer?.IsAvailable) return null;
          if (!matches(name, n, opts)) return null;
          return {
            pharmacy: config.name,
            productName: name.slice(0, 140),
            priceCents: Math.round(price * 100),
            url: p.link || `https://${config.hostname}/`,
            imageUrl: item?.images?.[0]?.imageUrl ?? null,
            ean: item?.ean ?? null,
          };
        })
        .filter((o): o is PriceOffer => o !== null);

    const searchPharmacy = (opts: { loosePack?: boolean; looseDose?: boolean } = {}) =>
      Promise.allSettled(
        configs.map(async (config) => {
          // 1) query completa (princípio + dose)
          let products = await vtexFetch(config.hostname, query, 5);
          let offers = matchOffers(products, config, opts);
          // 2) se veio pouco (<3): full-text multi-palavra underperforma — complementa
          //    com SÓ a 1ª palavra (marca/princípio) e faz MERGE deduplicado.
          //    ("BARISTAR SABOR BAUNILHA" fuzzy-miss; sibutramina mono acha só 1.)
          if (offers.length < 3 && firstWord.length >= 4 && firstWord !== query) {
            products = await vtexFetch(config.hostname, firstWord, 9);
            const seen = new Set(offers.map((o) => o.url));
            offers = [...offers, ...matchOffers(products, config, opts).filter((o) => !seen.has(o.url))];
          }
          // 3) zerou de novo? embalagem era chute (pack default 30 ≠ "4 Canetas"):
          //    re-matcha os ÚLTIMOS produtos sem filtro de pack (sem refetch).
          if (offers.length === 0 && n.packQty != null) {
            offers = matchOffers(products, config, { ...opts, loosePack: true });
          }
          return offers.slice(0, 4); // 4 por farmácia (com 9 = até 36)
        }),
      );

    const dedupeSorted = (lists: PromiseSettledResult<PriceOffer[]>[]): PriceOffer[] => {
      const seen = new Set<string>();
      return lists
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((o) => { const k = o.url || o.productName; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.priceCents - b.priceCents)
        .slice(0, 15);
    };

    let all = dedupeSorted(await searchPharmacy());

    // 4) GARANTIA (último recurso, só quando TODAS as farmácias zeraram): match de
    //    FAMÍLIA — tokens do ativo + pack loose + dose loose. O nome do produto fica
    //    visível no diálogo; "sem preço" é pior que "produto da família".
    if (all.length === 0) {
      all = dedupeSorted(await searchPharmacy({ loosePack: true, looseDose: true }));
    }
    return all;
  },
};
