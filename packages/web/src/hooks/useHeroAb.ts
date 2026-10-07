import { useMemo } from 'react';

/**
 * A/B da headline do hero padrão — split 50/50 persistido em localStorage.
 *
 * Medição (plano de 14 dias em docs/landing/COPY-v2.md):
 * - Hoje o PostHog é no-op; o console.info('[ab] hero=A|B') fica como marcador
 *   estável — quando o capture() for ligado, basta trocar o console pelo evento.
 * - Amostra: 14 dias, significância 95% (teste de duas proporções, duas caudas).
 * - Métrica primária: clique no CTA "Começar agora" (hero) por variante.
 *   Secundária: cadastro concluído (/registrar submit) por variante.
 * - Guardar a variante no cadastro (campo localStorage lido no submit) permite
 *   atribuir conversão mesmo com sessão multi-dia.
 *
 * Não roda na variante esportiva (?sports=1) — lá a headline é fixa (message
 * match com o cartaz da academia).
 */
export type HeroAbVariant = 'A' | 'B';
const STORAGE_KEY = 'ab:hero-v2';

export function useHeroAb(enabled: boolean): HeroAbVariant {
  return useMemo(() => {
    if (!enabled) return 'A';
    if (typeof window === 'undefined') return 'A';
    let v: string | null = null;
    try { v = window.localStorage.getItem(STORAGE_KEY); } catch { /* modo privado */ }
    if (v !== 'A' && v !== 'B') {
      v = Math.random() < 0.5 ? 'A' : 'B';
      try { window.localStorage.setItem(STORAGE_KEY, v); } catch { /* modo privado */ }
    }
    console.info(`[ab] hero=${v}`);
    return v as HeroAbVariant;
  }, [enabled]);
}
