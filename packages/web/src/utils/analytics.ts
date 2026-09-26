/**
 * Analytics de produto (G4 — padrão app grande): PostHog com init GUARDADO por env.
 *
 * Sem VITE_POSTHOG_KEY → tudo vira no-op (zero custo/zero rede — comportamento atual
 * do app não muda até o dono criar o projeto no PostHog e colar a key no .env).
 * Autocapture ligado: cliques/telas vêm de graça; eventos de NEGÓCIO são manuais aqui.
 *
 * Eventos (taxonomia enxuta, ver ionic-analytics/references/event-taxonomy.md):
 * - demo_started / demo_converted  → conversão do modo exemplo (R1)
 * - exam_extracted                 → extração concluída (funil de ativação)
 * - celebration_shown              → 1º exame (momento emocional)
 */
type Props = Record<string, string | number | boolean | undefined>;

let client: { capture: (e: string, p?: Props) => void } | null = null;

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';
  if (!key) return; // sem key = desligado (não tenta nada)
  import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        autocapture: true,
        capture_pageview: true, // HashRouter: pageviews saem tênues; autocapture cobre
        persistence: 'localStorage+cookie',
        opt_out_persistence_by_default: false, // LGPD: opt-out via /privacidade se pedir
      });
      client = posthog;
    })
    .catch(() => { /* CDN/bundle falhou — analytics nunca derruba o app */ });
}

/** track('evento', {chave: valor}) — no-op garantido sem client. Nunca lança. */
export function track(event: string, props?: Props): void {
  try { client?.capture(event, props); } catch { /* */ }
}
