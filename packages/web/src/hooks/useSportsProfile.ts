// Hook do PERFIL ESPORTIVO (E4.1) — GET /sports/profile com cache de SESSÃO
// (mesmo padrão do useClinicalGoals: módulo-cache + inflight, várias telas compartilham).
//
// O dashboard troca pra SportsDashboard SÓ quando profile.active===true (toggle do
// Perfil persiste no servidor desde o E1.5 — PUT inicializa o row). Sem perfil /
// active=false / fetch falhou → dashboard normal, INTOCADO (print-comparável).
//
// Invalidação: 'sports-profile-changed' (dispatch do SportsModeCard ao togglar) —
// voltar do Perfil pro Dashboard reflete o toggle na hora, sem esperar o TTL.
import { useEffect, useState } from 'react';
import { API_URL, token } from '../config';

export interface SportsProfile {
  id: string;
  patientId: string;
  active: boolean;
  modality?: string | null;
  trainingFreq?: string | null;
  goals?: string | null;
  supplements?: unknown;
  collectionContext?: unknown;
  declaredSubstances?: unknown;
  updatedAt?: string;
}

interface SportsProfileState {
  profile: SportsProfile | null;
  /** Kill-switch admin (AppSetting sportsMode.enabled) — vem junto no GET. */
  enabled: boolean;
}

let cache: SportsProfileState | null = null;
let inflight: Promise<SportsProfileState> | null = null;
let listeners = 0;

async function fetchProfile(): Promise<SportsProfileState> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      try {
        const r = await fetch(`${API_URL}/sports/profile`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) return { profile: null, enabled: false }; // 401/403/etc → modo normal (nunca bloqueia)
        const d = await r.json();
        cache = { profile: d.profile ?? null, enabled: d.enabled !== 0 };
        return cache;
      } catch {
        return { profile: null, enabled: false }; // offline → dashboard normal
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** Limpa o cache (toggle do Perfil / troca de paciente). A próxima chamada refaz o GET. */
export function invalidateSportsProfile(): void {
  cache = null;
}

/** Perfil esportivo do titular. `active` = true SÓ com perfil criado E toggle ligado. */
export function useSportsProfile(): SportsProfileState & { active: boolean } {
  const [state, setState] = useState<SportsProfileState>(() => cache ?? { profile: null, enabled: false });
  useEffect(() => {
    let alive = true;
    // Listener de invalidação anexado pelo PRIMEIRO hook do documento e removido pelo
    // último (sem acúmulo entre mounts/unmounts).
    if (listeners === 0 && typeof window !== 'undefined') {
      window.addEventListener('sports-profile-changed', invalidateSportsProfile);
      window.addEventListener('selPatientChanged', invalidateSportsProfile);
    }
    listeners++;
    void fetchProfile().then((s) => { if (alive) setState(s); });
    return () => {
      alive = false;
      listeners--;
      if (listeners === 0 && typeof window !== 'undefined') {
        window.removeEventListener('sports-profile-changed', invalidateSportsProfile);
        window.removeEventListener('selPatientChanged', invalidateSportsProfile);
      }
    };
  }, []);
  return { ...state, active: state.profile?.active === true };
}
