/**
 * Medidor de telas (25/11/26). Conta quais telas a pessoa abre e manda ao servidor em lote —
 * é o que alimenta o painel "Telas abertas" do admin. O banco só mostrava o que as pessoas
 * GRAVAM; telas de leitura (Tendências, Radar, Evolução…) eram invisíveis.
 *
 * Privacidade: sai daqui SÓ o caminho da rota, com ids/tokens trocados por ":id".
 * Nada de query string, nome de exame ou dado clínico. Nunca derruba o app: tudo em try/catch.
 */
import { Capacitor } from '@capacitor/core';
import { API_URL, token } from '../config';

const FLUSH_MS = 20_000;
const MAX_BUFFER = 40;
const buffer = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let last = { screen: '', at: 0 };
let listening = false;

/** "/exams/cmvq…4e/show?x=1" → "/exams/:id/show". Função pura (testada). */
export function normalizeScreen(pathname: string): string {
  const clean = (pathname || '/').split(/[?#]/)[0].toLowerCase();
  const segs = clean.split('/').filter(Boolean).map((seg) => {
    let s = seg;
    try { s = decodeURIComponent(seg); } catch { /* segmento malformado: usa cru */ }
    if (/^\d+$/.test(s)) return ':id'; // número
    if (s.length >= 16) return ':id'; // cuid, uuid, token de convite/emergência
    if (/\d/.test(s) && s.length >= 8) return ':id'; // id curto com dígitos
    if (!/^[a-z0-9\-_]+$/.test(s)) return ':id'; // qualquer coisa fora do alfabeto de rota
    return s;
  });
  const out = '/' + segs.join('/');
  return out.length > 80 ? out.slice(0, 80) : out;
}

function platform(): string {
  try { const p = Capacitor.getPlatform(); return p === 'android' || p === 'ios' ? p : 'web'; } catch { return 'web'; }
}

/** Manda o que está acumulado. `keepalive` deixa a request terminar com o app indo p/ segundo plano. */
export function flushScreens(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!buffer.size) return;
  const t = token();
  if (!t) { buffer.clear(); return; }
  const views = [...buffer.entries()].map(([screen, n]) => ({ screen, n }));
  buffer.clear();
  try {
    void fetch(`${API_URL}/usage/screens`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ platform: platform(), views }),
    }).catch(() => { /* sem rede: perde este lote, nunca insiste */ });
  } catch { /* fetch indisponível */ }
}

/** Registra a abertura de uma tela (chamado a cada troca de rota). */
export function trackScreen(pathname: string): void {
  try {
    if (!token()) return;
    const screen = normalizeScreen(pathname);
    const now = Date.now();
    // a mesma rota renderizando duas vezes seguidas (StrictMode, redirect) conta uma vez
    if (screen === last.screen && now - last.at < 1500) return;
    last = { screen, at: now };
    if (buffer.size >= MAX_BUFFER && !buffer.has(screen)) flushScreens();
    buffer.set(screen, (buffer.get(screen) ?? 0) + 1);
    if (!timer) timer = setTimeout(flushScreens, FLUSH_MS);
    if (!listening && typeof document !== 'undefined') {
      listening = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushScreens(); });
      window.addEventListener('pagehide', flushScreens);
    }
  } catch { /* medição nunca derruba a tela */ }
}

/** Só para teste. */
export function __resetScreenTracker(): void {
  buffer.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  last = { screen: '', at: 0 };
}
export function __bufferSnapshot(): Record<string, number> { return Object.fromEntries(buffer); }
