/**
 * Título, descrição, canonical e Open Graph por página pública.
 *
 * O app é uma SPA com um único index.html; sem isto, todo link compartilhado (WhatsApp,
 * Telegram, busca) mostra o título genérico da home. Aqui o servidor troca só essas tags no
 * HTML antes de responder. O resto da página continua sendo montado pelo JavaScript.
 */
export interface PublicSeo {
  title: string;
  description: string;
  canonical: string;
  image: string;
}

const SITE = 'https://drexame.janocaminho.com.br';

const PAGES: Record<string, PublicSeo> = {
  '/simulador-hormonal': {
    title: 'Simulador hormonal grátis: pico e vale da testosterona entre as aplicações | Dr. Exame',
    description: 'Simule a curva de testosterona, Durateston, Deposteron, enantato, deca e outros: pico, vale e oscilação entre as aplicações. Grátis, sem cadastro. No app, cruze com os seus exames.',
    canonical: `${SITE}/simulador-hormonal`,
    image: `${SITE}/promo/simulador-og.jpg`,
  },
};

export function publicSeoFor(path: string): PublicSeo | null {
  const key = path.replace(/\/+$/, '') || '/';
  return Object.prototype.hasOwnProperty.call(PAGES, key) ? PAGES[key] : null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Troca o conteúdo de uma tag do <head>; se a tag não existir, deixa o HTML como está. */
function swap(html: string, re: RegExp, replacement: string): string {
  return re.test(html) ? html.replace(re, () => replacement) : html;
}

export function applyPublicSeo(html: string, seo: PublicSeo): string {
  let out = html;
  out = swap(out, /<title>[\s\S]*?<\/title>/i, `<title>${esc(seo.title)}</title>`);
  out = swap(out, /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${esc(seo.description)}" />`);
  out = swap(out, /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${esc(seo.title)}" />`);
  out = swap(out, /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${esc(seo.description)}" />`);
  out = swap(out, /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${esc(seo.image)}" />\n    <meta property="og:url" content="${esc(seo.canonical)}" />\n    <meta name="twitter:card" content="summary_large_image" />`);
  out = swap(out, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${esc(seo.canonical)}" />`);
  return out;
}
