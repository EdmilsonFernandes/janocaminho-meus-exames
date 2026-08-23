import { useEffect, useState } from 'react';
import { API_URL } from '../config';

/**
 * Fonte ÚNICA do preço do plano no front — GET /billing/plans (público, sem auth).
 * Antes o R$19,90 vivia hardcode em 4 telas (Landing/Plans/ConsolidatedReport/FaqSection);
 * agora o admin muda o preço e TODAS refletem na hora (settings → API → aqui).
 */

export interface PlanInfo {
  price: number;          // preço cheio (settings.plans.monthly.price)
  effectivePrice: number; // preço que o checkout cobra HOJE (fundador, se ativo)
  founder: boolean;
  founderPrice?: number;  // null quando promo desligada
  founderRemaining?: number;
  periodDays: number;
  label: string;
  monthlyCredits: number; // espelha grants.monthly (o plano entrega isso)
}

export interface PlansPayload {
  plan: PlanInfo | null;
  packs: { id: string; credits: number; price: number; label: string; popular: boolean }[];
  premiumPerks: { consolidatedFree: boolean; familyLimit: number };
}

// Cache módulo-level: várias telas na mesma sessão compartilham 1 fetch (fetch-cache do SW
// também cacheia GET /api — aqui evitamos até a duplicidade de estado).
let cached: PlansPayload | null = null;
let inflight: Promise<PlansPayload | null> | null = null;

export async function fetchPlans(force = false): Promise<PlansPayload | null> {
  if (cached && !force) return cached;
  if (inflight) return inflight;
  inflight = fetch(`${API_URL}/billing/plans`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: any) => {
      if (!d?.plans?.[0]) return null;
      const p = d.plans[0];
      const payload: PlansPayload = {
        plan: {
          price: Number(p.price),
          effectivePrice: Number(p.effectivePrice ?? p.price),
          founder: !!p.founder,
          founderPrice: d.founder ? Number(d.founder.price) : undefined,
          founderRemaining: d.founder ? Number(d.founder.remaining) : undefined,
          periodDays: Number(p.periodDays ?? 30),
          label: String(p.label ?? 'Mensal'),
          monthlyCredits: Number(p.credits ?? 250),
        },
        packs: Array.isArray(d.creditPacks) ? d.creditPacks : [],
        premiumPerks: d.premiumPerks ?? { consolidatedFree: true, familyLimit: 10 },
      };
      cached = payload;
      return payload;
    })
    .catch(() => null)
    .finally(() => { inflight = null; });
  return inflight;
}

/** Hook: preço do plano nas telas (null = carregando/fallback silencioso). */
export function usePlanInfo(): PlansPayload | null {
  const [info, setInfo] = useState<PlansPayload | null>(cached);
  useEffect(() => { void fetchPlans().then((p) => { if (p) setInfo(p); }); }, []);
  return info;
}

/** "19.9" → "R$ 19,90" */
export const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
