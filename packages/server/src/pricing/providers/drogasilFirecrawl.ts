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

/** Extrai ofertas do markdown da Drogasil — formato REAL do Firecrawl:
 *  `[![Imagem](img)](url "Nome do Produto")` + `R$ X,XX` nas linhas seguintes.
 *  O nome vem no atributo TITLE do link (não no texto âncora). */
function parseDrogasilMarkdown(md: string, n: NormalizedMedication): PriceOffer[] {
  const offers: PriceOffer[] = [];
  const ingredient = normDrug(n.activeIngredient).split(' ')[0];

  // Padrão 1: [texto](url "Nome do Produto") — nome no title attribute
  const titleRe = /\[([^\]]*)\]\((https:\/\/www\.drogasil\.com\.br\/[^)\s]+)\s+"([^"]+)"\)/g;
  // Padrão 2: ## [Nome](url) — nome em heading com link
  const headRe = /## \[([^\]]+)\]\((https:\/\/www\.drogasil\.com\.br\/[^)\s]+)\)/g;

  const products: { name: string; url: string }[] = [];
  let m: RegExpExecArray | null;

  // extrai do title attribute
  while ((m = titleRe.exec(md)) !== null) {
    if (m[3] && m[3].length > 5) products.push({ name: m[3], url: m[2] });
  }
  // extrai de headings
  while ((m = headRe.exec(md)) !== null) {
    if (m[1] && m[1].length > 5) products.push({ name: m[1], url: m[2] });
  }

  // dedup por URL
  const seen = new Set<string>();
  const unique = products.filter((p) => { if (seen.has(p.url)) return false; seen.add(p.url); return true; });

  // para cada produto, acha o 1º preço após a posição dele no markdown
  for (const p of unique) {
    const pos = md.indexOf(p.url);
    if (pos < 0) continue;
    const after = md.slice(pos, pos + 600); // 600 chars após o produto
    const priceMatch = after.match(/R\$\s?([0-9.]+),(\d{2})/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[1].replace(/\./g, '') + '.' + priceMatch[2]);
    if (price <= 0 || price > 10000) continue;
    const pn = normDrug(p.name);
    if (!pn.includes(ingredient)) continue; // filtra: só o princípio ativo
    offers.push({
      pharmacy: 'Drogasil',
      productName: p.name.slice(0, 140),
      priceCents: Math.round(price * 100),
      url: p.url,
      imageUrl: null,
      ean: null,
    });
  }

  return offers.sort((a, b) => a.priceCents - b.priceCents).slice(0, 6);
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
