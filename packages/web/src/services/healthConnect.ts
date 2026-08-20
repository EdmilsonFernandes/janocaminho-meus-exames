/**
 * healthConnect — serviço do Activity Widget (Android Health Connect).
 *
 * O APK injeta `window.DxHealth` (HealthBridge.kt, padrão DxBiometrics). Toda chamada
 * async do nativo volta como CustomEvent `dx:health` com { type, requestId, ... } —
 * aqui viramos Promise. No navegador/desktop o bridge não existe e tudo degrada
 * graciosamente (null/false): o widget mostra o estado "disponível no app".
 */
import { API_URL, apiHeaders } from '../config';
import { normalizeDays, type ActivityDay } from '../utils/activityStats';

const EVENT = 'dx:health';
const TIMEOUT_MS = 20000;

declare global {
  interface Window {
    DxHealth?: {
      isAvailable(): boolean;
      hasAllPermissions(): boolean;
      requestPermissions(requestId: string): void;
      aggregates(requestId: string, daysBack: number): void;
    };
  }
}

type HealthEvent = CustomEvent<{ type: string; requestId?: string; granted?: boolean; days?: unknown[]; code?: string }>;

/** true somente no APK com Health Connect instalado e suportado. */
export const healthConnectSupported = (): boolean => {
  try { return typeof window !== 'undefined' && !!window.DxHealth?.isAvailable?.(); } catch { return false; }
};

/** Permissões já concedidas (checagem síncrona do bridge). */
export const hasHealthPermissions = (): boolean => {
  try { return healthConnectSupported() && !!window.DxHealth?.hasAllPermissions?.(); } catch { return false; }
};

/** Espera UM evento do bridge casando requestId+type, com timeout. */
const waitFor = <T>(type: string, requestId: string, invoke: () => void, extract: (e: HealthEvent) => T): Promise<T> =>
  new Promise<T>((resolve) => {
    let done = false;
    const cleanup = () => window.removeEventListener(EVENT, handler);
    const timer = window.setTimeout(() => { if (!done) { done = true; cleanup(); resolve(extractError('timeout')); } }, TIMEOUT_MS);
    const handler = (ev: Event) => {
      const e = ev as HealthEvent;
      if (e?.detail?.type === 'error' && e.detail.requestId === requestId) {
        if (!done) { done = true; clearTimeout(timer); cleanup(); resolve(extractError(e.detail.code ?? 'error')); }
        return;
      }
      if (e?.detail?.type === type && e.detail.requestId === requestId) {
        if (!done) { done = true; clearTimeout(timer); cleanup(); resolve(extract(e)); }
      }
    };
    const extractError = (code: string): T => extract({ detail: { type: 'error', code } } as HealthEvent);
    window.addEventListener(EVENT, handler);
    invoke();
  });

export interface PermissionOutcome { granted: boolean; code?: 'provider_update' | 'unavailable' | 'timeout' | 'denied' }

/** Códigos → UX honesta (fix 337: antes falhava em silêncio e o usuário não sabia o porquê). */
export const permissionOutcomeMessage = (code?: string): string => {
  switch (code) {
    case 'provider_update': return 'Seu Health Connect precisa de atualização — abra a Play Store, atualize o "Health Connect" (ou "Saúde Connect") e tente de novo.';
    case 'unavailable': return 'Health Connect não está disponível neste aparelho — verifique na Play Store se ele aparece como instalado/atualizável.';
    case 'timeout': return 'O Health Connect não respondeu — tente conectar de novo.';
    default: return 'Permissão não concedida — você pode tentar outra hora quando quiser.';
  }
};

/** Abre o popup NATIVO de permissão do Health Connect. Resolve com o MOTIVO quando falha. */
export const requestHealthPermissions = (): Promise<PermissionOutcome> => {
  if (!healthConnectSupported()) return Promise.resolve({ granted: false, code: 'unavailable' });
  const requestId = `perm-${Date.now()}`;
  return waitFor<PermissionOutcome>('permissions', requestId, () => window.DxHealth!.requestPermissions(requestId), (e) => {
    const granted = !!e.detail?.granted;
    return granted ? { granted } : { granted: false, code: (e.detail as any)?.code === 'provider_update' || (e.detail as any)?.code === 'unavailable' || (e.detail as any)?.code === 'timeout' ? (e.detail as any).code : 'denied' };
  });
};

/**
 * Agregado diário dos últimos `days` dias (mais recente primeiro).
 * Retorna null quando indisponível (web/desktop, HC ausente) ou em erro — o widget
 * decide o que mostrar; o serviço nunca joga.
 */
export const fetchActivityDays = async (days = 30): Promise<ActivityDay[] | null> => {
  if (!hasHealthPermissions()) return null;
  const requestId = `agg-${Date.now()}`;
  return waitFor<ActivityDay[] | null>('aggregates', requestId, () => window.DxHealth!.aggregates(requestId, days), (e) =>
    Array.isArray(e.detail?.days) ? normalizeDays(e.detail.days as Array<Partial<ActivityDay>>) : null,
  );
};

/**
 * Sincroniza os dias agregados com o motor do Dr. Exame (POST /measurements/activity-sync).
 * Grava como medições comuns → Linha do Tempo, Medições e Evolução enxergam o dado.
 */
export const syncActivityToServer = async (days: ActivityDay[]): Promise<{ synced: number; days: number }> => {
  const r = await fetch(`${API_URL}/measurements/activity-sync`, {
    method: 'POST',
    headers: apiHeaders(true),
    body: JSON.stringify({ days: days.map((d) => ({ date: d.date, steps: d.steps, kcal: Math.round(d.kcal), km: d.km })) }),
  });
  if (!r.ok) throw new Error(`Falha na sincronização (${r.status})`);
  return r.json();
};
