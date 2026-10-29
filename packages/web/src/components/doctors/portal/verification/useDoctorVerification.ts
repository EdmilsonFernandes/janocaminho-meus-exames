/**
 * Estado vivo da verificação de identidade do médico (KYC UaiID): fala com o servidor e entrega
 * ao gate/telas a `view` já resolvida pela matriz pura (`resolveKycView`).
 *
 *  - GET no mount; `refresh()` relê; poll de 4 s SÓ no "Conferindo" (teto 90 s); releitura a cada
 *    30 s no "Em análise"; releitura quando a aba/app volta ao primeiro plano (`visibilitychange`,
 *    `pageshow` do bfcache e, no APK, `browserFinished` da Custom Tab).
 *  - `start()` → POST + abrir o UaiID: web = mesma aba (popup aberto depois de um `await` perde o
 *    gesto e é bloqueado; a volta é o `return_url` do servidor); APK = Custom Tab (@capacitor/browser).
 *  - A volta do UaiID (`#/doctor?kyc=1&status=…&verification_id=…`) é CONSUMIDA na hora: só o
 *    `kyc=1` vira estado React e a URL é limpa com `navigate('/doctor', { replace: true })` — o
 *    `status` (texto controlável pelo usuário) e os ids nunca são lidos, exibidos nem registrados.
 *  - 401 → `onLogout`. Nunca `navigate(0)`/`reload()` (crasha o APK): atualizar = refazer o GET.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../../../../config';
import { copyText } from '../../../../utils/copyText';
import {
  KYC_TIMING, NETWORK_START_ERROR, classifyStartResponse, hasKycParam, isPracticing,
  normalizeDoctorInfo, normalizeVerification, parseBlocked, resolveKycView,
  type KycDoctorInfo, type KycSnapshot, type KycStartError, type KycView,
} from './kycState';

/* ── abrir o UaiID ───────────────────────────────────────────────────────────────── */

export interface OpenVerifyDeps {
  isNative: () => Promise<boolean>;
  /** Custom Tab / SFSafariViewController. */
  openInApp: (url: string) => Promise<void>;
  /** Plano B no app, se a Custom Tab falhar. */
  openWindow: (url: string) => void;
  /** Web: navegação na mesma aba. */
  assign: (url: string) => void;
  /** Web: quanto esperar antes de soltar o botão se a navegação não acontecer. */
  settleMs: number;
}

const defaultOpenDeps: OpenVerifyDeps = {
  isNative: async () => { const { Capacitor } = await import('@capacitor/core'); return Capacitor.isNativePlatform(); },
  openInApp: async (url) => { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url, toolbarColor: '#0f5f5a' }); },
  openWindow: (url) => { window.open(url, '_blank', 'noopener,noreferrer'); },
  assign: (url) => { window.location.assign(url); },
  settleMs: 6000,
};

/** Abre a URL de verificação do UaiID. `deps` existe para os testes (e só para eles). */
export async function openVerifyUrl(url: string, over: Partial<OpenVerifyDeps> = {}): Promise<'native' | 'web'> {
  const d: OpenVerifyDeps = { ...defaultOpenDeps, ...over };
  let native = false;
  try { native = await d.isNative(); } catch { native = false; }
  if (native) {
    try { await d.openInApp(url); } catch { d.openWindow(url); }
    return 'native';
  }
  d.assign(url);
  await new Promise<void>((resolve) => { setTimeout(resolve, d.settleMs); });
  return 'web';
}

/* ── pequenos utilitários ────────────────────────────────────────────────────────── */

const SEEN_KEY = 'kycSeenUnapproved';
/** O marcador vale para ESTE login (o fim do JWT muda a cada sessão), não para quem usou a aba antes. */
const fingerprint = (t: string) => t.slice(-16);
const readSeen = (token: string): boolean => {
  try { return window.sessionStorage.getItem(SEEN_KEY) === fingerprint(token); } catch { return false; }
};
const writeSeen = (token: string | null): void => {
  try {
    if (token) window.sessionStorage.setItem(SEEN_KEY, fingerprint(token));
    else window.sessionStorage.removeItem(SEEN_KEY);
  } catch { /* storage indisponível: só perde a tela "Conta aprovada" depois de um reload */ }
};
const readJson = async (res: Response): Promise<unknown> => {
  try { return await res.json(); } catch { return null; }
};
const urlHasKyc = (): boolean => typeof window !== 'undefined' && hasKycParam(window.location.hash, window.location.search);
/** O fetch do app (utils/fetch-cache.ts) serve cache / "vazio limpo" com status 200 quando está offline. */
const servedOffline = (res: Response): boolean => res.headers.get('X-Served-From') !== null || res.headers.get('X-Offline-Empty') !== null;

/* ── o hook ──────────────────────────────────────────────────────────────────────── */

export interface DoctorVerification {
  view: KycView;
  snapshot: KycSnapshot | null;
  /** Nome/CRM para personalizar (null se o /me falhou — as telas funcionam sem). */
  doctor: KycDoctorInfo | null;
  blocked: { reason: string | null } | null;
  /** Releitura manual em andamento. */
  refreshing: boolean;
  /** POST em andamento. */
  starting: boolean;
  startError: KycStartError | null;
  /** Link copiado (ou, se o aparelho não deixou, o link para copiar na mão). */
  copied: { url: string; ok: boolean } | null;
  /** O "Conferindo" passou de 90 s. */
  checkingSlow: boolean;
  refresh: () => Promise<void>;
  /** 'open' abre o UaiID; 'copy' só cria a sessão e copia o link (para abrir no celular). */
  start: (mode?: 'open' | 'copy') => Promise<void>;
  /** "Ir para o portal" na tela "Conta aprovada". */
  acknowledgeApproved: () => void;
  /** "Atualizar" depois dos 90 s: relê e reabre a janela de 90 s. */
  retryChecking: () => void;
  /** "Ainda não terminou? Continuar verificação" (a partir do "Conferindo" lento). */
  resume: () => void;
}

export function useDoctorVerification(token: string, onLogout: () => void): DoctorVerification {
  const navigate = useNavigate();

  const [snapshot, setSnapshot] = useState<KycSnapshot | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [blocked, setBlocked] = useState<{ reason: string | null } | null>(null);
  const [doctor, setDoctor] = useState<KycDoctorInfo | null>(null);
  const [kycFlag, setKycFlag] = useState<boolean>(urlHasKyc);
  const [returned, setReturned] = useState(false);
  const [sawUnapproved, setSawUnapproved] = useState<boolean>(() => readSeen(token));
  const [celebrated, setCelebrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<KycStartError | null>(null);
  const [copied, setCopied] = useState<{ url: string; ok: boolean } | null>(null);
  const [checkSince, setCheckSince] = useState<number | null>(null);
  const [checkingSlow, setCheckingSlow] = useState(false);

  const tokenRef = useRef(token);
  const onLogoutRef = useRef(onLogout);
  const navigateRef = useRef(navigate);
  const aliveRef = useRef(false);
  const inflightRef = useRef<Promise<void> | null>(null);
  const startingRef = useRef(false);
  const launchedRef = useRef(false); // abrimos o UaiID nesta sessão (para reconhecer a volta ao primeiro plano)
  const whoTriedRef = useRef(false);
  useEffect(() => { tokenRef.current = token; onLogoutRef.current = onLogout; navigateRef.current = navigate; });

  /** GET /api/doctor/verification. Chamadas simultâneas se juntam numa só. */
  const load = useCallback((manual = false): Promise<void> => {
    if (inflightRef.current) return inflightRef.current;
    const run = async (): Promise<void> => {
      if (manual) setRefreshing(true);
      try {
        const res = await fetch(`${API_URL}/doctor/verification`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
        if (!aliveRef.current) return;
        if (res.status === 401) { onLogoutRef.current(); return; }
        const body = await readJson(res);
        if (!aliveRef.current) return;
        const suspended = parseBlocked(res.status, body);
        if (suspended) { setBlocked(suspended); return; }
        const snap = res.ok && !servedOffline(res) ? normalizeVerification(body) : null;
        if (!snap) { setLoadFailed(true); return; }
        setSnapshot(snap);
        setLoadFailed(false);
        setBlocked(null);
        if (!isPracticing(snap, Date.now())) { setSawUnapproved(true); writeSeen(tokenRef.current); }
      } catch {
        if (aliveRef.current) setLoadFailed(true);
      } finally {
        if (manual && aliveRef.current) setRefreshing(false);
      }
    };
    const p = run().finally(() => { inflightRef.current = null; });
    inflightRef.current = p;
    return p;
  }, []);

  /* mount: 1ª leitura + releitura quando o app/aba volta ao primeiro plano */
  useEffect(() => {
    aliveRef.current = true;
    void load();
    const onBack = () => { if (launchedRef.current) setReturned(true); void load(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onBack(); };
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      startingRef.current = false; // voltou do UaiID pelo "voltar" do navegador (bfcache): solta o botão
      setStarting(false);
      onBack();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);

    let cancelled = false;
    let removeNative: (() => void) | undefined;
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { Browser } = await import('@capacitor/browser');
        const handle = await Browser.addListener('browserFinished', () => onBack());
        if (cancelled) void handle.remove();
        else removeNative = () => { void handle.remove(); };
      } catch { /* plugin indisponível: o visibilitychange cobre */ }
    })();

    return () => {
      cancelled = true;
      aliveRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      removeNative?.();
    };
  }, [load]);

  /* volta do UaiID: consome o `kyc=1` e limpa a URL (status/ids do UaiID não ficam na barra nem no histórico) */
  useEffect(() => {
    const consume = () => {
      if (!urlHasKyc()) return;
      setKycFlag(true);
      navigateRef.current('/doctor', { replace: true });
      void load();
    };
    consume();
    window.addEventListener('hashchange', consume);
    return () => window.removeEventListener('hashchange', consume);
  }, [load]);

  const view = useMemo<KycView>(
    () => resolveKycView({ snapshot, loadFailed, blocked, kycFlag, returned, sawUnapproved, celebrated }),
    [snapshot, loadFailed, blocked, kycFlag, returned, sawUnapproved, celebrated],
  );
  const screen = view.screen;

  /* saiu do "Conferindo": o gatilho (URL / volta ao primeiro plano) está consumido */
  useEffect(() => {
    if (screen === 'checking' || screen === 'loading') return;
    setKycFlag(false);
    setReturned(false);
    launchedRef.current = false;
  }, [screen]);

  /* o aviso de "link copiado" só faz sentido nas telas que têm o botão de copiar */
  useEffect(() => {
    if (screen !== 'intro' && screen !== 'continue') setCopied(null);
  }, [screen]);

  /* "Conferindo": janela de 90 s + poll de 4 s */
  useEffect(() => {
    if (screen === 'checking') setCheckSince((s) => s ?? Date.now());
    else { setCheckSince(null); setCheckingSlow(false); }
  }, [screen]);
  useEffect(() => {
    if (screen !== 'checking' || checkSince === null || checkingSlow) return undefined;
    const id = window.setInterval(() => {
      if (Date.now() - checkSince >= KYC_TIMING.checkMaxMs) { setCheckingSlow(true); return; }
      void load();
    }, KYC_TIMING.checkPollMs);
    return () => window.clearInterval(id);
  }, [screen, checkSince, checkingSlow, load]);

  /* "Em análise": auto-refresh de 30 s (o dono decide quando decide) */
  useEffect(() => {
    if (screen !== 'review') return undefined;
    const id = window.setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, KYC_TIMING.reviewRefreshMs);
    return () => window.clearInterval(id);
  }, [screen, load]);

  /* quem está sendo verificado (nome + CRM) — só para quem vê a jornada; o dashboard busca o que precisa */
  const needsWho = snapshot !== null && !isPracticing(snapshot, Date.now());
  useEffect(() => {
    if (!needsWho || whoTriedRef.current) return;
    whoTriedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/doctor/me`, { headers: { Authorization: `Bearer ${tokenRef.current}` } });
        const info = res.ok && !servedOffline(res) ? normalizeDoctorInfo(await readJson(res)) : null;
        if (aliveRef.current && info) setDoctor(info);
      } catch { /* sem nome: a jornada funciona igual, só sem o chip de identidade */ }
    })();
  }, [needsWho]);

  const start = useCallback(async (mode: 'open' | 'copy' = 'open'): Promise<void> => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError(null);
    setCopied(null);
    try {
      let res: Response;
      try {
        res = await fetch(`${API_URL}/doctor/verification`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenRef.current}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
      } catch {
        if (aliveRef.current) setStartError(NETWORK_START_ERROR);
        return;
      }
      const outcome = classifyStartResponse(res.status, await readJson(res));
      if (!aliveRef.current) return;
      switch (outcome.kind) {
        case 'logout': onLogoutRef.current(); return;
        case 'blocked': setBlocked({ reason: outcome.reason }); return;
        case 'refresh': await load(true); return;
        case 'error': setStartError(outcome.error); return;
        case 'ok': {
          if (mode === 'copy') {
            const ok = await copyText(outcome.verifyUrl);
            if (aliveRef.current) setCopied({ url: outcome.verifyUrl, ok });
            return;
          }
          launchedRef.current = true;
          await openVerifyUrl(outcome.verifyUrl);
          return;
        }
      }
    } finally {
      startingRef.current = false;
      if (aliveRef.current) setStarting(false);
    }
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);
  const acknowledgeApproved = useCallback(() => { setCelebrated(true); writeSeen(null); }, []);
  const retryChecking = useCallback(() => { setCheckSince(Date.now()); setCheckingSlow(false); void load(true); }, [load]);
  const resume = useCallback(() => { setKycFlag(false); setReturned(false); void start('open'); }, [start]);

  return { view, snapshot, doctor, blocked, refreshing, starting, startError, copied, checkingSlow, refresh, start, acknowledgeApproved, retryChecking, resume };
}
