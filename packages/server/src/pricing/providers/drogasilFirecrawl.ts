/**
 * Provider Drogasil — via Firecrawl (bypassa Akamai anti-bot com proxies residenciais).
 *
 * A Drogasil bloqueia acesso direto (403 Akamai), mas o Firecrawl scrapea com
 * navegador stealth + proxy residencial. Validado em campo (2026-08-22):
 * losartana → R$ 156,90 · R$ 99,90 · R$ 33,99 · R$ 20,05.
 *
 * Custo: 1 crédito Firecrawl por consulta (500 grátis = ~50 remédios × 10 consultas).
 * Cache: 2h (o worker não consulta o mesmo remédio de novo).
 *
 * Privacidade: recebe somente produto/dose — nada do paciente sai.
 */
import type { MedicationPriceProvider, PriceOffer } from '../provider';
import type { NormalizedMedication } from '../normalize';
import { normDrug } from '../../utils/interactions';

const FC_KEY = process.env.FIRECRAWL_API_KEY || '';
const FC_URL = 'https://api.firecrawl.dev/v2/scrape';

interface DrogasilProduct {
  name?: string;
  price?: number;
  url?: string;
  image?: string;
}

/** Extrai ofertas do markdown da Drogasil (padrão: "R$ X,XX" após nome do produto). */
function parseDrogasilMarkdown(md: string, n: NormalizedMedication): PriceOffer[] {
  const offers: PriceOffer[] = [];
  const lines = md.split('\n');
  const ingredient = normDrug(n.activeIngredient).split(' ')[0];

  let currentName = '';
  let currentUrl = '';

  for (const line of lines) {
    // URL do produto
    const urlMatch = line.match(/\[([^\]]+)\]\((https:\/\/www\.drogasil\.com\.br\/[^)]+)\)/);
    if (urlMatch) {
      currentName = urlMatch[1].trim();
      currentUrl = urlMatch[2];
      continue;
    }
    // Preço (R$ X,XX ou R$ X.XXX,XX)
    const priceMatch = line.match(/R\$\s?([0-9.]+),(\d{2})/);
    if (priceMatch && currentName) {
      const price = parseFloat(priceMatch[1].replace(/\./g, '') + '.' + priceMatch[2]);
      const p = normDrug(currentName);
      // filtra: só o princípio ativo pedido
      if (p.includes(ingredient) && price > 0 && price < 10000) {
        offers.push({
          pharmacy: 'Drogasil',
          productName: currentName.slice(0, 140),
          priceCents: Math.round(price * 100),
          url: currentUrl,
          imageUrl: null, // Firecrawl não extrai imagens do markdown da Drogasil
          ean: null,
        });
      }
      currentName = ''; // reset — próximo produto
    }
  }

  return offers
    .filter((o, i, arr) => arr.findIndex((x) => x.url === o.url) === i) // dedup por URL
    .sort((a, b) => a.priceCents - b.priceCents)
    .slice(0, 6);
}

async function firecrawlScrape(url: string): Promise<string> {
  const r = await fetch(FC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FC_KEY}` },
    body: JSON.stringify({ url, formats: ['markdown'] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Firecrawl respondeu ${r.status}`);
  const j = (await r.json()) as { data?: { markdown?: string } };
  return j?.data?.markdown ?? '';
}

export const drogasilFirecrawlProvider: MedicationPriceProvider = {
  name: 'drogasil-firecrawl',
  async search(n: NormalizedMedication): Promise<PriceOffer[]> {
    if (!FC_KEY || !n.activeIngredient) return [];
    const dose = n.dosageValue ? ` ${n.dosageValue}${(n.dosageUnit || 'mg').toLowerCase()}` : '';
    const slug = `${n.activeIngredient}${dose}`.trim().toLowerCase().replace(/\s+/g, '-');
    const md = await firecrawlScrape(`https://www.drogasil.com.br/search?q=${encodeURIComponent(slug)}`);
    return parseDrogasilMarkdown(md, n);
  },
};
