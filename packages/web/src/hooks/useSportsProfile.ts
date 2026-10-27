// Hook do PERFIL ESPORTIVO (E4.1) — GET /sports/profile com cache de SESSÃO
// (mesmo padrão do useClinicalGoals: módulo-cache + inflight, várias telas compartilham).
//
// O dashboard troca pra SportsDashboard SÓ quando profile.active===true (toggle do
// Perfil persiste no servidor desde o E1.5 — PUT inicializa o row). Sem perfil /
// active=false / fetch falhou → dashboard normal, INTOCADO (print-comparável).
//
// POR PACIENTE (bug 27/10/26): o perfil é do paciente SELECIONADO (?patientId=). Antes o
// GET devolvia sempre o titular e a lente esportiva dele aparecia no painel de qualquer
// dependente. Cache, inflight e assinantes são chaveados pelo pid ('' = titular, compat).
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

/** URL do perfil esportivo de um paciente (sem pid = titular — compat de APK antigo). */
export const sportsProfileUrl = (pid?: string | null): string =>
  `${API_URL}/sports/profile${pid ? `?patientId=${encodeURIComponent(pid)}` : ''}`;

const EMPTY: SportsProfileState = { profile: null, enabled: false };
const cache = new Map<string, SportsProfileState>();
const inflight = new Map<string, Promise<SportsProfileState>>();
/** Último paciente pedido por um hook — é o que o evento de mudança refaz (o PUT do
 *  toggle/wizard grava no paciente selecionado, que é o que está montado). */
let lastPid = '';

/** Hooks montados — cada um recebe o estado novo do SEU paciente (sem reload). */
const subscribers = new Set<{ pid: string; fn: (s: SportsProfileState) => void }>();
function notifySubscribers(pid: string, s: SportsProfileState): void {
  subscribers.forEach((sub) => { if (sub.pid === pid) sub.fn(s); });
}

async function fetchProfile(pid: string, force = false): Promise<SportsProfileState> {
  const cached = cache.get(pid);
  if (!force && cached) return cached;
  const running = inflight.get(pid);
  if (running && !force) return running;
  const cur = (async () => {
    try {
      const r = await fetch(sportsProfileUrl(pid), { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return cache.get(pid) ?? EMPTY; // 401/403/etc → mantém o que havia DESTE paciente (nunca bloqueia)
      const d = await r.json();
      const s = { profile: d.profile ?? null, enabled: d.enabled !== 0 };
      cache.set(pid, s);
      return s;
    } catch {
      return cache.get(pid) ?? EMPTY; // offline → estado anterior DESTE paciente ou dashboard normal
    }
  })();
  inflight.set(pid, cur);
  void cur.finally(() => { if (inflight.get(pid) === cur) inflight.delete(pid); });
  return cur;
}

/** 'sports-profile-changed' (PUT do toggle/wizard): refetch em background e NOTIFICA —
 *  o DashboardV2 montado re-renderiza com o perfil novo (lente reorganiza na hora).
 *  Exportado p/ teste (o listener do módulo chama este — mesma instância). */
export async function handleSportsProfileChanged(pid: string = lastPid): Promise<void> {
  const s = await fetchProfile(pid, true);
  notifySubscribers(pid, s);
}

/** 'selPatientChanged' (troca de titular/dependente ou de conta): limpa tudo e avisa
 *  (hooks voltam ao neutro; o hook do paciente novo refaz o GET pelo próprio pid). */
export function handleSelPatientChanged(): void {
  cache.clear();
  inflight.clear();
  subscribers.forEach((sub) => sub.fn(EMPTY));
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
  cache.clear();
  inflight.clear();
  lastPid = '';
}

/** Assina o cache do módulo (o que o setState do hook faz). P/ TESTE — prova que o
 *  evento disparado sem hook montado ainda alcança quem montar depois. */
export function subscribeForTests(fn: (s: SportsProfileState) => void, pid = ''): () => void {
  const sub = { pid, fn };
  subscribers.add(sub);
  return () => { subscribers.delete(sub); };
}

/** Perfil esportivo do paciente `pid` (sem pid = titular). `active` = true SÓ com perfil
 *  criado E toggle ligado — do PRÓPRIO paciente, nunca herdado do titular. */
export function useSportsProfile(pid?: string | null): SportsProfileState & { active: boolean } {
  const key = pid ?? '';
  const [state, setState] = useState<{ key: string; s: SportsProfileState }>(() => ({ key, s: cache.get(key) ?? EMPTY }));
  // Troca de paciente: nem 1 render com o perfil do anterior (o estado guarda de quem é).
  const current = state.key === key ? state.s : (cache.get(key) ?? EMPTY);
  useEffect(() => {
    lastPid = key;
    let alive = true;
    const sub = { pid: key, fn: (s: SportsProfileState) => { if (alive) setState({ key, s }); } };
    subscribers.add(sub);
    // Stale-while-revalidate no MOUNT: devolve o cache na hora (pintura instantânea) e
    // dispara um refetch silencioso — quando responde, notifica e o dado atualiza sozinho.
    void fetchProfile(key, true).then((s) => { if (alive) setState({ key, s }); });
    return () => { alive = false; subscribers.delete(sub); };
  }, [key]);
  return { ...current, active: current.profile?.active === true };
}
