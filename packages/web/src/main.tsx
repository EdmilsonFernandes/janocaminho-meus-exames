import './utils/fetch-cache'; // OFFLINE-FIRST: instala o cache de fetch ANTES de qualquer request
import { Capacitor } from '@capacitor/core';
import { installDiag } from './utils/diag';

// DEPLOY RODANDO COM ABA ABERTA (dono 24/10: "Failed to fetch dynamically
// imported module …/Chat-*.js"): o app antigo em memória pede chunk que o
// deploy novo trocou de hash → rota lazy morre até o F5. Auto-recuperação:
// recarrega 1× sozinho NO NAVEGADOR (APK nunca — reload crasha a WebView).
const PRELOAD_RELOADED = 'dx_preload_reloaded';
const recoverStaleChunk = () => {
  if (Capacitor.isNativePlatform()) return;
  try { if (sessionStorage.getItem(PRELOAD_RELOADED)) return; sessionStorage.setItem(PRELOAD_RELOADED, '1'); } catch { /* storage bloqueado — reload só desta sessão de página */ }
  window.location.reload();
};
window.addEventListener('vite:preloadError', recoverStaleChunk);
window.addEventListener('error', (e) => {
  if (String(e?.message || '').includes('Failed to fetch dynamically imported module')) recoverStaleChunk();
});

try {
  installDiag(); // ring buffer de erros + captura global → "enviar diagnóstico" no Perfil
} catch (e) {
  console.warn('installDiag failed safely', e);
}
import React from 'react';
import { createRoot } from 'react-dom/client';
// G3 — Sentry CAPACITOR (nível app grande): captura crash NATIVO (webview/ANR) além do
// JS. Regra da skill ionic-sentry: SEMPRE importar de @sentry/capacitor (ele re-exporta a
// API do framework mantendo a ponte nativa viva) — nunca de @sentry/react direto.
import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { initAnalytics } from './utils/analytics';
import { captureSignupSource } from './utils/signupSource';

// SENTRY — error tracking em produção. Sem DSN = desligado.
const SENTRY_DSN = 'https://80ba46ffe060f8851a79ded388bead7d@o4511611776663552.ingest.us.sentry.io/4511611790163968';
if (SENTRY_DSN) {
  try {
    Sentry.init(
      {
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        release: 'dre-xame@' + ((window as any).__BUILD_INFO__?.version ?? 'dev'),
        tracesSampleRate: 0.1,
      },
      SentryReact.init,
    );
  } catch (err) {
    console.warn('Sentry init failed safely', err);
  }
}

// G4 — analytics de produto (PostHog): no-op até existir VITE_POSTHOG_KEY no env.
try {
  initAnalytics();
} catch (e) {
  console.warn('initAnalytics failed safely', e);
}

// ORIGEM DO CADASTRO: captura utm/referrer no 1º toque (landing) e persiste — antes só era
// lida no submit do /registrar, quando a UTM e o referrer externos já tinham se perdido
// (acquisitionSource saiu 100% vazio em prod mesmo implementado desde 18/10).
try {
  captureSignupSource();
} catch { /* storage bloqueado — segue sem origem */ }

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <App />
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
