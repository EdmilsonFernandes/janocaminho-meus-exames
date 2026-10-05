/**
 * Ring buffer de eventos do client (últimos ~60) + montagem de diagnóstico
 * compartilhável — "core dump" pro USUÁRIO contribuir com o suporte (Sentry cobre
 * o lado dev; aqui quem está com o problema na mão manda o contexto na hora).
 * Zero PII: só mensagens/urls/timestamps — nunca corpo de request/response.
 */
import { APP_BUILD_INFO } from '../generated/buildInfo';

type DiagEvent = { t: string; kind: 'error' | 'warn' | 'info'; msg: string; url?: string };
const BUF: DiagEvent[] = [];
const MAX = 60;

export function diagPush(kind: DiagEvent['kind'], msg: string, url?: string) {
  BUF.push({ t: new Date().toISOString().slice(11, 19), kind, msg: String(msg).slice(0, 220), url: url?.slice(0, 120) });
  if (BUF.length > MAX) BUF.shift();
}

/** Instala captura global (console + erros de window) — 1x no boot (main.tsx). */
export function installDiag() {
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => { diagPush('error', a.map(String).join(' ')); ce(...a); };
  const cw = console.warn.bind(console);
  console.warn = (...a: unknown[]) => { diagPush('warn', a.map(String).join(' ')); cw(...a); };
  window.addEventListener('error', (e) => diagPush('error', e.message, e.filename));
  window.addEventListener('unhandledrejection', (e) => diagPush('error', `promise: ${String((e as PromiseRejectionEvent).reason).slice(0, 200)}`));
  const of = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const r = await of(input, init);
      if (!r.ok && r.status >= 500) diagPush('error', `HTTP ${r.status}`, String(input));
      return r;
    } catch (e) {
      diagPush('error', `rede: ${(e as Error).message} — ${navigator.onLine ? 'online' : 'OFFLINE'}`, String(input));
      throw e;
    }
  };
}

/** Texto pronto pro usuário compartilhar (sem PII). */
export function diagReport(): string {
  const lines = BUF.map((e) => `${e.t} [${e.kind}]${e.url ? ` (${e.url})` : ''} ${e.msg}`);
  return [
    `Dr. Exame — diagnóstico`,
    `versão: ${APP_BUILD_INFO.version} (${APP_BUILD_INFO.commit ?? 'dev'}) · ${new Date().toLocaleString('pt-BR')}`,
    `conexão: ${navigator.onLine ? 'online' : 'offline'}`,
    ``,
    ...(lines.length ? lines : ['(nenhum erro registrado nesta sessão)']),
  ].join('\n');
}

/** Compartilha via Web Share (Android) com fallback mailto. */
export async function diagShare() {
  const text = diagReport();
  try {
    if (navigator.share) { await navigator.share({ title: 'Dr. Exame — diagnóstico', text }); return 'shared'; }
  } catch { /* usuário cancelou */ }
  window.location.href = `mailto:contato@janocaminho.com.br?subject=${encodeURIComponent('Dr. Exame — diagnóstico')}&body=${encodeURIComponent(text)}`;
  return 'mailto';
}
