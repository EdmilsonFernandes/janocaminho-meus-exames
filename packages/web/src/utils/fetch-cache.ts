/**
 * OFFLINE-FIRST: wrapper transparente do window.fetch.
 *
 * Cacheia TODAS as respostas GET da API. Quando o fetch falha (offline, timeout,
 * servidor fora) → serve o cache (ou um vazio limpo). Zero mudança por página.
 *
 * Instalado em main.tsx ANTES do app renderizar. Funciona em web + APK (Capacitor).
 * Cache persiste em localStorage (sobrevive a reload/fechar o app).
 */

const CACHE_KEY = '__meus_exames_api_cache';
const cache = new Map<string, { body: unknown; ts: number }>();

// Endpoints NÃO cacheáveis (streams, health, pagamentos, mutations, uploads).
// `measurements`: dado clínico movido pelo sync do Health Connect — offline serve
// cache SEM TTL (bug: evolução mostrava atividade de ontem). Sem cache, offline esses
// GETs caem no vazio limpo e os cards somem (por design deles).
// `doctor/verification` e a fila do admin (KYC do médico): status de identidade NUNCA vem do cache — offline sem
// cache o "vazio limpo" abaixo (200 + {items:[],…}) seria lido como "sem status" e o portal mostraria o passo
// "Vamos validar sua identidade" a quem já está em análise (ou um status velho a quem acabou de ser aprovado).
// Sem cache o fetch lança e a tela mostra "Sem conexão. Tente novamente.".
const EXCLUDE = /\/api\/(chat|health|build-info|billing|devices\/token|public\/|patients\/.*\/photo|doctor\/photo|doctor\/verification|admin\/doctors\/verification-queue|measurements)/;

// Carrega cache persistido do localStorage (sobrevive a reload/fechar app).
try {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, { body: unknown; ts: number }>;
    for (const [k, v] of Object.entries(parsed)) cache.set(k, v);
  }
} catch { /* cache corrompido — começa vazio */ }

// Persiste em localStorage (debounced — não a cada request, evita travar a UI).
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const obj: Record<string, unknown> = {};
      // Limita a 80 entradas (mais recentes) pra não estourar a quota do localStorage.
      const entries = [...cache.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, 80);
      for (const [k, v] of entries) obj[k] = v;
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch { /* quota exceeded — ignora (cache em memória continua funcionando) */ }
  }, 2000);
}

// AUD-091: o cache era key=URL e não por usuário — numa máquina/navegador compartilhado,
// o dado clínico cacheado de uma conta era servido para OUTRA (estado misto no AppBar).
// A chave passa a levar o id do token atual; cache de A nunca casa com B. Entradas antigas
// (sem prefixo) simplesmente nunca mais casam e são coletadas pelo limite de 80.
function cacheKeyFor(urlStr: string): string {
  try {
    // Portal médico guarda o token em 'doctorToken' (revisão R4) — sem ele, dois médicos
    // na mesma máquina ainda compartilhariam o cache offline.
    const tok = localStorage.getItem('doctorToken') ?? localStorage.getItem('token') ?? '';
    const payloadB64 = tok.split('.')[1];
    if (payloadB64) {
      const claims = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
      if (claims?.userId) return `${claims.userId}:${urlStr}`;
      if (claims?.doctorId) return `${claims.doctorId}:${urlStr}`;
    }
  } catch { /* token ausente/ilegível — chave crua (comportamento anterior) */ }
  return urlStr;
}

const originalFetch = window.fetch;

window.fetch = (async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request)?.url ?? '';
  const isCacheable = method === 'GET' && urlStr.includes('/api/') && !EXCLUDE.test(urlStr);

  try {
    const res = await originalFetch(input as any, init);

    // SLIDING SESSION: o server (requireAuth) renova o token quando ele está perto de
    // expirar, devolvendo o novo em X-Renewed-Token. Lemos aqui — no ponto central de
    // fetch — e trocamos no localStorage. Assim TODO request autenticado (upload, listas,
    // dataProvider, profile…) renova transparente; o usuário ativo nunca perde a sessão.
    if (urlStr.includes('/api/')) {
      try {
        const renewed = res.headers.get('X-Renewed-Token');
        // photoToken roda JUNTO: sem isto ele expirava em 7d (TTL do JWT) e as URLs ?t= das
        // fotos 401avam — photoAuthToken até pula o expirado, mas rotacionar mantém a janela
        // de cache estável do <img> em vez de cair pro token que muda toda renovação.
        if (renewed) { localStorage.setItem('token', renewed); if (localStorage.getItem('photoToken')) localStorage.setItem('photoToken', renewed); }
      } catch { /* localStorage/headers indisponíveis — ignora */ }
    }

    // Cacheia respostas GET /api/ bem-sucedidas (2xx).
    if (isCacheable && res.ok) {
      res.clone().json().then((body) => {
        cache.set(cacheKeyFor(urlStr), { body, ts: Date.now() });
        scheduleSave();
      }).catch(() => { /* não-JSON — ignora */ });
    }
    return res;
  } catch (err) {
    // Fetch falhou (offline, timeout, server unreachable).
    if (isCacheable) {
      // Tem cache? → serve (dados de antes — offline-ready).
      const cached = cache.get(cacheKeyFor(urlStr));
      if (cached) {
        return new Response(JSON.stringify(cached.body), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Served-From': 'offline-cache' },
        });
      }
      // Sem cache → devolve vazio limpo (não erro — sem "failed to fetch").
      return new Response(JSON.stringify({ items: [], data: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Offline-Empty': 'true' },
      });
    }
    // Não-cacheável (POST/PUT/DELETE, chat, etc.) → deixa o erro propagar.
    throw err;
  }
}) as typeof window.fetch;
