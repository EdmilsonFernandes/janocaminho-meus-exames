/**
 * Provider Mercado Livre (v1) — preço REAL sem chave, via JSON-LD (`@graph`) server-side
 * renderizado da página de lista. Validado por recon (2026-08-22): 200 + @graph com
 * Product{name, brand, offers{price, priceCurrency, url}}.
 *
 * ⚠️ AVISO LEGAL/ESTABILIDADE: é leitura de página pública em volume BAIXO e cacheado
 * (TTL 6h + 1 request por chave). Não é API oficial — a evolução correta é o app OAuth
 * do programa de afiliados (documentado) quando houver conta. Kill-switch:
 * PRICE_PROVIDERS_OFF=1 desliga TUDO. Adapter isolado: se o ML mudar o HTML, só este
 * arquivo quebra (worker marca provider_error e o resto do app segue).
 *
 * Privacidade: recebe somente produto/dose/embalagem — nada do paciente sai.
 */
import type { MedicationPriceProvider, PriceOffer } from '../provider';
import type { NormalizedMedication } from '../normalize';
import { normDrug } from '../../utils/interactions';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface MlProduct { '@type'?: string; name?: string; offers?: { price?: number; priceCurrency?: string; url?: string; availability?: string } }

/** Filtra produtos que REALMENTE são o princípio ativo + dose pedidos (a busca do ML
 *  traz perturbadores — "Alcort p/ cães" numa busca de prednisolona etc.). */
function isMatch(productName: string, n: NormalizedMedication): boolean {
  const p = normDrug(productName);
  const ingredient = normDrug(n.activeIngredient).split(' ')[0]; // 1ª palavra do ativo basta p/ filtro
  if (!p.includes(ingredient)) return false;
  if (n.dosageValue != null) {
    // dose precisa aparecer (50 → "50MG"|"50 MG"|"50MG" — aceita junto de outra palavra)
    const dose = String(n.dosageValue).replace('.', ',');
    if (!new RegExp(`(^|\\D)${n.dosageValue}(\\D|$)`).test(p) && !p.includes(dose)) return false;
  }
  return true;
}

async function fetchMlList(slug: string): Promise<MlProduct[]> {
  const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`;
  // Fetch via SUBPROCESS curl: o fetch do Node (undici) recebe challenge "suspicious-traffic"
  // do ML (fingerprint TLS); o curl passa (validado 2026-08-22). Adapter isolado — se o ML
  // apertar, vira provider_error e o resto do app segue. Caminho oficial: OAuth afiliados.
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const html = await promisify(execFile)('curl', [
    '-sL', '-m', '20', '--compressed',
    '-A', UA,
    '-H', 'Accept-Language: pt-BR,pt;q=0.9',
    url,
    ], { maxBuffer: 12 * 1024 * 1024, timeout: 25_000 }).then((r) => r.stdout).catch((e) => { throw new Error(`curl falhou: ${String(e.message).slice(0, 80)}`); });
  if (!html || html.length < 5000) throw new Error('ML devolveu página vazia/challenge');
  const block = [...html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).find((b) => b.includes('"@graph"'));
  if (!block) throw new Error('ld+json @graph não encontrado (layout mudou?)');
  const graph = JSON.parse(block)['@graph'] as MlProduct[];
  return Array.isArray(graph) ? graph.filter((g) => g?.['@type'] === 'Product' && g.offers?.price != null && g.offers.url) : [];
}

export const mercadoLivreProvider: MedicationPriceProvider = {
  name: 'mercado-livre',
  async search(n: NormalizedMedication): Promise<PriceOffer[]> {
    if (!n.activeIngredient) return [];
    const doseSlug = n.dosageValue ? `-${n.dosageValue}${(n.dosageUnit || 'mg').toLowerCase()}` : '';
    const slug = `${normDrug(n.activeIngredient).split(' ').join('-').toLowerCase()}${doseSlug}`;
    const products = await fetchMlList(slug);
    return products
      .filter((p) => isMatch(String(p.name), n))
      .map((p) => ({
        pharmacy: 'Mercado Livre',
        productName: String(p.name).slice(0, 140),
        priceCents: Math.round(Number(p.offers!.price) * 100),
        url: String(p.offers!.url),
      }))
      .filter((o) => o.priceCents > 0)
      .sort((a, b) => a.priceCents - b.priceCents)
      .slice(0, 8);
  },
};
