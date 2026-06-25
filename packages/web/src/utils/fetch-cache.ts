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
const EXCLUDE = /\/api\/(chat|health|build-info|billing|devices\/token|public\/|patients\/.*\/photo|doctor\/photo)/;

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

const originalFetch = window.fetch;

window.fetch = (async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request)?.url ?? '';
  const isCacheable = method === 'GET' && urlStr.includes('/api/') && !EXCLUDE.test(urlStr);

  try {
    const res = await originalFetch(input as any, init);

    // Cacheia respostas GET /api/ bem-sucedidas (2xx).
    if (isCacheable && res.ok) {
      res.clone().json().then((body) => {
        cache.set(urlStr, { body, ts: Date.now() });
        scheduleSave();
      }).catch(() => { /* não-JSON — ignora */ });
    }
    return res;
  } catch (err) {
    // Fetch falhou (offline, timeout, server unreachable).
    if (isCacheable) {
      // Tem cache? → serve (dados de antes — offline-ready).
      const cached = cache.get(urlStr);
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
