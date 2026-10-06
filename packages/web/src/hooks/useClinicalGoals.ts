// Hook de metas clínicas (E2.3/E2.4) — busca /sports/clinical-goals uma vez POR SESSÃO
// (cache em módulo: várias telas — Trends/Evolution/ExamShow — compartilham o fetch).
// Paciente LÊ: qualquer tentativa de escrita é rota médica (401 por construção).
import { useEffect, useState } from 'react';
import { API_URL, token } from '../config';
import type { ClinicalGoalView } from '@meus-exames/shared';

let cache: { goals: ClinicalGoalView[]; at: number } | null = null;
let inflight: Promise<ClinicalGoalView[]> | null = null;
const TTL_MS = 5 * 60 * 1000; // revalida a cada 5min (médico pode criar/exprir meta no portal)

async function fetchGoals(): Promise<ClinicalGoalView[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.goals;
  if (!inflight) {
    inflight = (async () => {
      try {
        const r = await fetch(`${API_URL}/sports/clinical-goals`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) return cache?.goals ?? [];
        const d = await r.json();
        cache = { goals: Array.isArray(d.goals) ? d.goals : [], at: Date.now() };
        return cache.goals;
      } catch {
        return cache?.goals ?? []; // offline/falha → mantém cache (nunca bloqueia a tela)
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** Metas clínicas VIGENTES dos pacientes do user. Sem meta / erro → [] (tela idêntica à atual). */
export function useClinicalGoals(): ClinicalGoalView[] {
  const [goals, setGoals] = useState<ClinicalGoalView[]>(() => cache?.goals ?? []);
  useEffect(() => {
    let active = true;
    void fetchGoals().then((g) => { if (active) setGoals(g); });
    return () => { active = false; };
  }, []);
  return goals;
}
