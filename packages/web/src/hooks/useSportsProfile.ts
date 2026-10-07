// Hook do PERFIL ESPORTIVO (E4.1) — GET /sports/profile com cache de SESSÃO
// (mesmo padrão do useClinicalGoals: módulo-cache + inflight, várias telas compartilham).
//
// O dashboard troca pra SportsDashboard SÓ quando profile.active===true (toggle do
// Perfil persiste no servidor desde o E1.5 — PUT inicializa o row). Sem perfil /
// active=false / fetch falhou → dashboard normal, INTOCADO (print-comparável).
//
// Invalidação (júri E4+ "lente stale"): o listener de 'sports-profile-changed' vive no
// ESCOPO DO MÓDULO — o dispatch acontece no Perfil (wizard/toggle) com o dashboard
// DESMONTADO, então um listener preso ao mount do hook deixaria o evento morrer.
// Com listener sempre ativo: evento → refetch silencioso (stale-while-revalidate —
// quem já pintou continua com o cache velho) → cache atualizado → hooks montados
// NOTIFICADOS e re-renderizam (trocar a lente no wizard reorganiza o dashboard sem reload).
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

/** Hooks montados — recebem o estado novo quando o cache atualiza (sem reload). */
const subscribers = new Set<(s: SportsProfileState) => void>();
function notifySubscribers(s: SportsProfileState): void {
  subscribers.forEach((fn) => fn(s));
}

async function fetchProfile(force = false): Promise<SportsProfileState> {
  if (!force && cache) return cache;
  if (!inflight || force) {
    inflight = (async () => {
      try {
        const r = await fetch(`${API_URL}/sports/profile`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) return cache ?? { profile: null, enabled: false }; // 401/403/etc → mantém o que havia (nunca bloqueia)
        const d = await r.json();
        cache = { profile: d.profile ?? null, enabled: d.enabled !== 0 };
        return cache;
      } catch {
        return cache ?? { profile: null, enabled: false }; // offline → estado anterior ou dashboard normal
      }
    })();
    const cur = inflight;
    void cur.finally(() => { if (inflight === cur) inflight = null; });
    return cur;
  }
  return inflight;
}

/** 'sports-profile-changed' (PUT do toggle/wizard): refetch em background e NOTIFICA —
 *  o DashboardV2 montado re-renderiza com o perfil novo (lente reorganiza na hora).
 *  Exportado p/ teste (o listener do módulo chama este — mesma instância). */
export async function handleSportsProfileChanged(): Promise<void> {
  const s = await fetchProfile(true);
  notifySubscribers(s);
}

/** 'selPatientChanged' (troca de titular/dependente): o cache é POR USUÁRIO → limpa e
 *  avisa (hooks voltam ao neutro até o próximo fetch do mount). */
export function handleSelPatientChanged(): void {
  cache = null;
  inflight = null;
  notifySubscribers({ profile: null, enabled: false });
}

/** Listener no ESCOPO DO MÓDULO (sempre ativo): o dispatch pode acontecer com NENHUM
 *  hook montado — aqui o evento NUNCA morre; o refetch atualiza o cache e, quando o
 *  dashboard montar de novo, o useState inicial já lê o dado fresco. */
if (typeof window !== 'undefined') {
  window.addEventListener('sports-profile-changed', () => { void handleSportsProfileChanged(); });
  window.addEventListener('selPatientChanged', handleSelPatientChanged);
}

/** Limpa o cache (compat: troca de paciente/API externa). A próxima chamada refaz o GET. */
export function invalidateSportsProfile(): void {
  cache = null;
  inflight = null;
}

/** Assina o cache do módulo (o que o setState do hook faz). P/ TESTE — prova que o
 *  evento disparado sem hook montado ainda alcança quem montar depois. */
export function subscribeForTests(fn: (s: SportsProfileState) => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/** Perfil esportivo do titular. `active` = true SÓ com perfil criado E toggle ligado. */
export function useSportsProfile(): SportsProfileState & { active: boolean } {
  const [state, setState] = useState<SportsProfileState>(() => cache ?? { profile: null, enabled: false });
  useEffect(() => {
    const onCache = (s: SportsProfileState) => setState(s);
    subscribers.add(onCache);
    // Stale-while-revalidate no MOUNT: devolve o cache na hora (pintura instantânea) e
    // dispara um refetch silencioso — quando responde, notifica e o dado atualiza sozinho.
    void fetchProfile(true).then((s) => setState(s));
    return () => { subscribers.delete(onCache); };
  }, []);
  return { ...state, active: state.profile?.active === true };
}
