import './utils/fetch-cache'; // OFFLINE-FIRST: instala o cache de fetch ANTES de qualquer request
import { installDiag } from './utils/diag';
installDiag(); // ring buffer de erros + captura global → "enviar diagnóstico" no Perfil
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

// SENTRY — error tracking em produção. Sem DSN = desligado.
const SENTRY_DSN = 'https://80ba46ffe060f8851a79ded388bead7d@o4511611776663552.ingest.us.sentry.io/4511611790163968';
if (SENTRY_DSN) {
  Sentry.init(
    {
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      release: 'dre-xame@' + ((window as any).__BUILD_INFO__?.version ?? 'dev'),
      tracesSampleRate: 0.1,
    },
    SentryReact.init,
  );
}

// G4 — analytics de produto (PostHog): no-op até existir VITE_POSTHOG_KEY no env.
initAnalytics();

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
