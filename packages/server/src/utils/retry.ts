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
