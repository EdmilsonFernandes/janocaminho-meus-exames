/**
 * Título, descrição, canonical e Open Graph por página pública.
 *
 * O app é uma SPA com um único index.html; sem isto, todo link compartilhado (WhatsApp,
 * Telegram, busca) mostra o título genérico da home. Aqui o servidor troca só essas tags no
 * HTML antes de responder. O resto da página continua sendo montado pelo JavaScript.
 *
 * 25/11/26 (estudo de aquisição): antes só o simulador tinha entrada — qualquer outra URL
 * (inclusive uma inexistente) devolvia o MESMO HTML com o título da home, então o Google via
 * uma página só. Agora cada página real tem as suas tags, as que mostram a MESMA tela apontam
 * o canonical para a original (ALIASES) e caminho desconhecido responde 404.
 *
 * Texto: sem promessa de diagnóstico, previsão ou "leitura de risco" (RDC 657/2022 — o app é
 * educativo). Título ≤ ~60 caracteres e descrição ≤ ~155 para não serem cortados na busca.
 */
export interface PublicSeo {
  title: string;
  description: string;
  canonical: string;
  image: string;
}

const SITE = 'https://drexame.janocaminho.com.br';
const DEFAULT_IMAGE = `${SITE}/capa-ia.png`;

type Page = Omit<PublicSeo, 'canonical' | 'image'> & { image?: string; lastmod: string; priority: string };

/** Páginas com conteúdo PRÓPRIO (entram no sitemap). */
const PAGES: Record<string, Page> = {
  '/': {
    title: 'Dr. Exame: entenda seu exame de sangue em linguagem simples',
    description: 'Envie o PDF ou a foto do seu exame de sangue e veja cada resultado explicado em português simples, com a evolução ao longo do tempo. De qualquer laboratório.',
    lastmod: '2026-11-25', priority: '1.0',
  },
  '/saude-esportiva': {
    title: 'Exames de sangue para quem treina: Modo Saúde Esportiva | Dr. Exame',
    description: 'Acompanhe os exames que importam para quem treina — CK, creatinina, hematócrito, hormônios — explicados em linguagem simples e comparados ao longo do tempo.',
    lastmod: '2026-11-25', priority: '0.8',
  },
  '/simulador-hormonal': {
    title: 'Simulador hormonal grátis: pico e vale da testosterona entre as aplicações | Dr. Exame',
    description: 'Simule a curva de testosterona, Durateston, Deposteron, enantato, deca e outros: pico, vale e oscilação entre as aplicações. Grátis, sem cadastro. No app, cruze com os seus exames.',
    image: `${SITE}/promo/simulador-og.jpg`,
    lastmod: '2026-11-14', priority: '0.8',
  },
  '/features': {
    title: 'O que o Dr. Exame faz com os seus exames | Dr. Exame',
    description: 'Leitura automática do PDF ou foto, explicação de cada resultado, evolução em gráficos, exames da família em um só lugar e compartilhamento com o seu médico.',
    lastmod: '2026-11-25', priority: '0.6',
  },
  '/faq': {
    title: 'Perguntas frequentes sobre o Dr. Exame',
    description: 'Como enviar um exame, o que a inteligência artificial faz e o que ela não faz, privacidade dos seus dados, créditos e planos. Respostas diretas.',
    lastmod: '2026-11-25', priority: '0.6',
  },
  '/como-validamos': {
    title: 'Como o Dr. Exame confere a leitura dos seus exames',
    description: 'Como os valores são lidos do laudo, quais faixas de referência usamos e os limites do app: ele explica e organiza, não faz diagnóstico nem substitui o médico.',
    lastmod: '2026-11-25', priority: '0.6',
  },
  '/para-medicos': {
    title: 'Dr. Exame para médicos: exames do paciente organizados',
    description: 'Receba os exames que o paciente compartilhou, já organizados por data e por marcador, com a evolução em gráficos. Acesso gratuito mediante CRM.',
    lastmod: '2026-11-25', priority: '0.5',
  },
  '/termos': {
    title: 'Termos de uso | Dr. Exame',
    description: 'Termos de uso do Dr. Exame: o que o serviço oferece, responsabilidades e limites de uma ferramenta educativa de saúde.',
    lastmod: '2026-10-07', priority: '0.3',
  },
  '/privacidade': {
    title: 'Política de privacidade (LGPD) | Dr. Exame',
    description: 'Como o Dr. Exame trata os seus dados de saúde: o que coletamos, para quê, com quem compartilhamos e como pedir a exclusão, conforme a LGPD.',
    lastmod: '2026-10-07', priority: '0.3',
  },
};

/** Rotas que mostram a MESMA tela de outra: respondem com as tags e o canonical da original. */
const ALIASES: Record<string, string> = {
  '/landing': '/',
  '/como-funciona': '/',
  '/entender-exames-de-sangue': '/',
  '/exames-para-atletas': '/saude-esportiva',
  '/calculadora-de-esteres': '/simulador-hormonal',
};

/** 1º segmento das rotas que o app conhece (telas logadas, autenticação, médico…). Fora desta
 *  lista e das páginas públicas, o caminho não existe: responde 404 (antes era 200 = "soft 404").
 *  Rota nova esquecida aqui continua ABRINDO (o HTML do app é servido igual) — só o status muda. */
const APP_SEGMENTS = new Set([
  'entrar', 'registrar', 'recuperar-senha', 'convite', 'dr', 'doctor', 'emergencia', 'teleconsulta', 'admin',
  'api-docs', 'exams', 'patients', 'items', 'analyses', 'evolucao', 'familia', 'tendencias', 'linha-do-tempo',
  'relatorio', 'alterados', 'lembretes', 'consultas', 'medicoes', 'saude-mental', 'sinais', 'composicao',
  'alimentacao', 'medicamentos', 'radar-hormonal', 'vacinas', 'despesas', 'diario', 'chat', 'notificacoes',
  'planos', 'medicos', 'encontrar', 'conquistas', 'suporte', 'perfil', 'carteira', 'indique', 'perguntas',
  'minhas-perguntas', 'seguranca', 'minhasaude',
]);

const norm = (path: string) => (path.replace(/\/+$/, '') || '/').toLowerCase();
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function publicSeoFor(path: string): PublicSeo | null {
  const key = norm(path);
  const target = own(ALIASES, key) ? ALIASES[key] : key;
  if (!own(PAGES, target)) return null;
  const p = PAGES[target];
  return { title: p.title, description: p.description, canonical: target === '/' ? `${SITE}/` : `${SITE}${target}`, image: p.image ?? DEFAULT_IMAGE };
}

/** O caminho existe? (página pública, apelido, ou rota do app). Arquivo estático é resolvido antes. */
export function isKnownPath(path: string): boolean {
  const key = norm(path);
  if (own(PAGES, key) || own(ALIASES, key)) return true;
  return APP_SEGMENTS.has(key.split('/')[1] ?? '');
}

/** Caminhos públicos que o app deve abrir SEM redirecionar (lista usada pelo script do index.html). */
export const PUBLIC_PATHS: string[] = [...Object.keys(PAGES), ...Object.keys(ALIASES)].filter((p) => p !== '/');

export function sitemapXml(): string {
  const urls = Object.entries(PAGES).map(([path, p]) => `  <url>
    <loc>${SITE}${path === '/' ? '/' : path}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
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
