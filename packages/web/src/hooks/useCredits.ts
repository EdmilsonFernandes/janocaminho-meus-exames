// Hook do saldo de créditos — FONTE ÚNICA do número no front (chip do header, drawer,
// carteira). Antes cada consumidor fazia seu GET no mount e só sabia de mudanças via
// evento "creditsChanged"; quem gastava num lugar não atualizava o outro (bug do dono:
// "qualquer evento que mexa em transações tem que atualizar o topo").
//
// Modelo (mesmo padrão do useClinicalGoals): cache de MÓDULO + inflight + TTL.
// - Vários consumidores ⇒ 1 fetch só (TTL 30s deduplica; inflight segura rajadas).
// - Revalida a cada 30s (polling inteligente: pega o que o server creditou sozinho —
//   webhook de compra, bônus de indicação pago quando o OUTRO usuário se cadastra,
//   bônus admin — nenhum desses tem evento no cliente desta sessão).
// - Evento "creditsChanged" (bumpCredits) ⇒ refetch IMEDIATO forçado (sem esperar TTL).
// - Foco/aba visível ⇒ refetch (rede de segurança ao voltar pro app).
import { useCallback, useEffect, useState } from 'react';
import { API_URL, token } from '../config';

const TTL_MS = 30_000;

let cache: { credits: number | null; at: number } | null = null;
let inflight: Promise<number | null> | null = null;
const subscribers = new Set<(c: number | null) => void>();

async function fetchCredits(force = false): Promise<number | null> {
  // Anônimo na landing: NÃO pede billing sem sessão (401 no console — regra do chip).
  if (!token()) return null;
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.credits;
  if (!inflight) {
    inflight = (async () => {
      try {
        const r = await fetch(`${API_URL}/billing/status`, { headers: { Authorization: `Bearer ${token()}` } });
        const d = r.ok ? await r.json() : null;
        const c = typeof d?.credits === 'number' ? d.credits : null;
        cache = { credits: c, at: Date.now() };
        return c;
      } catch {
        return cache?.credits ?? null; // offline/falha → mantém o último saldo conhecido
      } finally {
        inflight = null;
      }
    })();
  }
  const c = await inflight;
  subscribers.forEach((fn) => fn(c));
  return c;
}

/** Invalida o cache e revalida AGORA (chamado pelo bumpCredits de utils/credits-events).
 *  Rajada de chamadas (evento + foco juntos) continua sendo 1 request (inflight). */
export const invalidateCredits = (): void => { void fetchCredits(true); };

/** Saldo reativo: `{ credits, refresh }`. `credits === null` = ainda não sabe (anônimo/
 *  offline) — quem renderiza decide esconder. `refresh()` força revalidação imediata. */
export function useCredits(): { credits: number | null; refresh: () => void } {
  const [credits, setCredits] = useState<number | null>(() => cache?.credits ?? null);

  useEffect(() => {
    let active = true;
    const upd = (c: number | null) => { if (active) setCredits(c); };
    subscribers.add(upd);
    void fetchCredits().then(upd);

    // Polling compartilhado: cada consumidor tem interval, mas o TTL do cache de módulo
    // garante 1 fetch real a cada 30s não importa quantos useCredits() existam.
    const iv = setInterval(() => { void fetchCredits(); }, TTL_MS);
    const invalidate = () => { void fetchCredits(true); };
    const onVisible = () => { if (document.visibilityState === 'visible') invalidate(); };

    window.addEventListener('creditsChanged', invalidate);
    window.addEventListener('selPatientChanged', invalidate);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      subscribers.delete(upd);
      clearInterval(iv);
      window.removeEventListener('creditsChanged', invalidate);
      window.removeEventListener('selPatientChanged', invalidate);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const refresh = useCallback(() => { void fetchCredits(true); }, []);
  return { credits, refresh };
}
