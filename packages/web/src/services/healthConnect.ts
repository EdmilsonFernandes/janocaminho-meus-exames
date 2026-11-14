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
      aggregates(requestId: string, daysBack: number, offsetDays: number): void;
      // Composição corporal — só existe em APK a partir do versionCode 585.
      hasBodyPermissions?(): boolean;
      requestBodyPermissions?(requestId: string): void;
      bodyComposition?(requestId: string, daysBack: number): void;
    };
  }
}

type HealthEvent = CustomEvent<{ type: string; requestId?: string; granted?: boolean; days?: unknown[]; readings?: unknown[]; stats?: unknown; code?: string }>;

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

export interface PermissionOutcome { granted: boolean; code?: 'provider_update' | 'unavailable' | 'timeout' | 'denied' | 'settings_opened' }

/** Códigos → UX honesta (fix 337: antes falhava em silêncio e o usuário não sabia o porquê). */
export const permissionOutcomeMessage = (code?: string): string => {
  switch (code) {
    case 'provider_update': return 'Seu Health Connect precisa de atualização — abra a Play Store, atualize o "Health Connect" (ou "Saúde Connect") e tente de novo.';
    case 'unavailable': return 'Health Connect não está disponível neste aparelho — verifique na Play Store se ele aparece como instalado/atualizável.';
    case 'timeout': return 'O Health Connect não respondeu — tente conectar de novo.';
    case 'settings_opened': return 'Abrimos o Health Connect pra você — conceda as permissões ao Dr. Exame lá e volte pra cá.';
    default: return 'Permissão não concedida — você pode tentar outra hora quando quiser.';
  }
};

/** Abre o popup NATIVO de permissão do Health Connect. Resolve com o MOTIVO quando falha. */
export const requestHealthPermissions = (): Promise<PermissionOutcome> => {
  if (!healthConnectSupported()) return Promise.resolve({ granted: false, code: 'unavailable' });
  const requestId = `perm-${Date.now()}`;
  return waitFor<PermissionOutcome>('permissions', requestId, () => window.DxHealth!.requestPermissions(requestId), (e) => {
    const granted = !!e.detail?.granted;
    if (granted) return { granted };
    const code = (e.detail as any)?.code ?? (e.detail as any)?.openedSettings ? 'settings_opened' : 'denied';
    return { granted: false, code: code as PermissionOutcome['code'] };
  });
};

/**
 * Agregado diário dos últimos `days` dias (mais recente primeiro). `offsetDays` desloca
 * a janela p/ o passado (backfill). Retorna null quando indisponível (web/desktop, HC
 * ausente) ou em erro — o widget decide o que mostrar; o serviço nunca joga.
 */
export const fetchActivityDays = async (days = 30, offsetDays = 0): Promise<ActivityDay[] | null> => {
  if (!hasHealthPermissions()) return null;
  const requestId = `agg-${Date.now()}-${offsetDays}`;
  return waitFor<ActivityDay[] | null>('aggregates', requestId, () => window.DxHealth!.aggregates(requestId, days, offsetDays), (e) =>
    Array.isArray(e.detail?.days) ? normalizeDays(e.detail.days as Array<Partial<ActivityDay>>) : null,
  );
};

/**
 * BACKFILL 90 dias (padrão Life Dashboard: histórico cheio no 1º connect). Lê em 3
 * chunks de 30 (cap do bridge por chamada + quota de leitura do Health Connect espaçada)
 * e mergeia por data. Um chunk que falha NÃO aborta os outros — devolve o que reuniu.
 */
export const backfillActivityDays = async (): Promise<ActivityDay[]> => {
  const all = new Map<string, ActivityDay>();
  for (const offset of [60, 30, 0]) {
    const chunk = await fetchActivityDays(30, offset).catch(() => null);
    if (!chunk) continue;
    for (const d of chunk) all.set(d.date, d);
  }
  return [...all.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
};

/**
 * Sincroniza os dias agregados com o motor do Dr. Exame (POST /measurements/activity-sync).
 * Grava como medições comuns → Linha do Tempo, Medições e Evolução enxergam o dado.
 * Batching interno ≤30 dias/post (o server rejeita >31 de uma vez — backfill de 90 passa em 3 posts).
 */
export const syncActivityToServer = async (days: ActivityDay[]): Promise<{ synced: number; days: number }> => {
  let synced = 0;
  let counted = 0;
  for (let i = 0; i < days.length; i += 30) {
    const batch = days.slice(i, i + 30);
    const r = await fetch(`${API_URL}/measurements/activity-sync`, {
      method: 'POST',
      headers: apiHeaders(true),
      body: JSON.stringify({ days: batch.map((d) => ({ date: d.date, steps: d.steps, kcal: Math.round(d.kcal), km: d.km, hr: Math.round(d.hrRest ?? d.hrAvg ?? 0), exerciseMin: Math.max(0, Math.round(d.exerciseMin ?? 0)), sleepMin: Math.max(0, Math.round(d.sleepMin ?? 0)) })) }),
    });
    if (!r.ok) throw new Error(`Falha na sincronização (${r.status})`);
    const j = await r.json();
    synced += j.synced ?? 0;
    counted += j.days ?? 0;
  }
  return { synced, days: counted };
};

// ------------------------------------------------------------------ composição corporal

/** Uma avaliação lida do Health Connect (relógio/balança): gordura + peso da mesma origem. */
export interface HealthBodyReading {
  time: string;
  origin: string;
  weightKg: number;
  /** De onde veio o peso: junto da medição, do mesmo dia, ou o último conhecido. */
  weightFrom?: 'same' | 'near' | 'carried';
  bodyFatPct: number;
  bmrKcal?: number;
  heightCm?: number;
  leanKg?: number;
  waterKg?: number;
}

/** true quando o APK instalado já traz a leitura de composição corporal (AAB 585+). */
export const bodyCompositionSupported = (): boolean => {
  try { return healthConnectSupported() && typeof window.DxHealth?.bodyComposition === 'function'; } catch { return false; }
};

export const hasBodyPermissions = (): boolean => {
  try { return bodyCompositionSupported() && !!window.DxHealth?.hasBodyPermissions?.(); } catch { return false; }
};

/** Popup nativo SÓ das permissões de composição corporal. */
export const requestBodyPermissions = (): Promise<PermissionOutcome> => {
  if (!bodyCompositionSupported()) return Promise.resolve({ granted: false, code: 'unavailable' });
  const requestId = `bperm-${Date.now()}`;
  return waitFor<PermissionOutcome>('permissions', requestId, () => window.DxHealth!.requestBodyPermissions!(requestId), (e) => {
    if (e.detail?.granted) return { granted: true };
    const detail = e.detail as { code?: PermissionOutcome['code']; openedSettings?: boolean };
    return { granted: false, code: detail?.code ?? (detail?.openedSettings ? 'settings_opened' : 'denied') };
  });
};

/** Avaliações dos últimos `days` dias; null = indisponível, sem permissão ou erro. */
export const fetchBodyReadings = (days = 730): Promise<HealthBodyReading[] | null> => {
  if (!hasBodyPermissions()) return Promise.resolve(null);
  const requestId = `body-${Date.now()}`;
  return waitFor<HealthBodyReading[] | null>('bodycomp', requestId, () => window.DxHealth!.bodyComposition!(requestId, days), (e) =>
    Array.isArray(e.detail?.readings) ? (e.detail.readings as HealthBodyReading[]) : null,
  );
};

/** O que o Health Connect tinha quando lemos (vem do app a partir da versão 594). */
export interface HealthBodyStats {
  /** Registros de % de gordura encontrados. */
  fats: number;
  weights: number;
  /** Medições de gordura sem nenhum peso aproveitável (não viram avaliação). */
  unpaired: number;
  /** Horário da medição de gordura mais recente no Health Connect. */
  latestFat?: string;
}

/** Igual a fetchBodyReadings, mas com as contagens, para a tela explicar o que aconteceu. */
export const fetchBodyReadingsDetailed = (days = 730): Promise<{ readings: HealthBodyReading[]; stats: HealthBodyStats | null } | null> => {
  if (!hasBodyPermissions()) return Promise.resolve(null);
  const requestId = `body-${Date.now()}`;
  return waitFor<{ readings: HealthBodyReading[]; stats: HealthBodyStats | null } | null>('bodycomp', requestId, () => window.DxHealth!.bodyComposition!(requestId, days), (e) =>
    Array.isArray(e.detail?.readings)
      ? { readings: e.detail.readings as HealthBodyReading[], stats: e.detail.stats && typeof e.detail.stats === 'object' ? (e.detail.stats as HealthBodyStats) : null }
      : null,
  );
};

/** Grava no servidor (sem IA, grátis). O servidor valida e ignora o que já foi importado. */
export const syncBodyReadings = async (readings: HealthBodyReading[], patientId?: string | null): Promise<{ imported: number; skipped: number }> => {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < readings.length; i += 100) {
    const r = await fetch(`${API_URL}/body-composition/health-connect`, {
      method: 'POST',
      headers: apiHeaders(true),
      body: JSON.stringify({ patientId, readings: readings.slice(i, i + 100) }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json?.error || 'Não foi possível importar as medições.');
    imported += json.imported ?? 0;
    skipped += json.skipped ?? 0;
  }
  return { imported, skipped };
};
