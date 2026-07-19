import './utils/fetch-cache'; // OFFLINE-FIRST: instala o cache de fetch ANTES de qualquer request
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GoogleOAuthProvider } from '@react-oauth/google';

// SENTRY — error tracking em produção. Sem DSN = desligado.
const SENTRY_DSN = 'https://80ba46ffe060f8851a79ded388bead7d@o4511611776663552.ingest.us.sentry.io/4511611790163968';
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

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
