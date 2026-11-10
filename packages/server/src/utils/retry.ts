/**
 * Retentativa com backoff exponencial + jitter para erros de rate limit do relay de IA.
 * Só retenta em erros transientes (429 / rate_limit_error / 1302); outros erros propagam.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || '');
      const isRateLimit =
        e?.status === 429 ||
        e?.error?.type === 'rate_limit_error' ||
        /rate_limit|rate limit|\b1302\b|too many requests/i.test(msg);
      if (!isRateLimit || attempt === maxRetries) throw e;
      const base = Math.min(5000 * Math.pow(2, attempt), 40000); // 5s, 10s, 20s, 40s
      const jitter = Math.floor(Math.random() * 2500);
      const wait = base + jitter;
      console.warn(`[IA] rate limit — retentativa ${attempt + 1}/${maxRetries} em ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/**
 * Retentativa RÁPIDA p/ transientes de relay/rede (dono 10/11: "resumo com retry por
 * trás — 3 tentativas, ~2s entre elas, erro só na 3ª; rate limit da GLM às vezes dá").
 * Diferente da withRateLimitRetry (backoff 5-40s, pensada p/ extração): aqui o usuário
 * está ESPERANDO a resposta na tela — cobre 429 E transientes de rede/5xx/stream.
 * Erro definitivo (4xx de auth/validação) propaga na hora.
 */
export async function withQuickRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number; waitMs?: number }): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const waitMs = opts?.waitMs ?? 2000;
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || '');
      const status = Number(e?.status ?? 0);
      const transient =
        status === 429 ||
        status === 408 ||
        status >= 500 ||
        e?.error?.type === 'rate_limit_error' ||
        /rate_limit|rate limit|\b1302\b|too many requests|timeout|timed out|econnreset|econnrefused|etimedout|socket hang up|fetch failed|aborted|network|stream/i.test(msg);
      if (!transient || i === attempts - 1) throw e;
      console.warn(`[IA] transiente — retentativa rápida ${i + 1}/${attempts} em ${waitMs * (i + 1)}ms (${msg.slice(0, 80)})`);
      await new Promise((r) => setTimeout(r, waitMs * (i + 1))); // 2s, 4s
    }
  }
  throw lastErr;
}
