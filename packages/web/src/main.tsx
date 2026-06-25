import './utils/fetch-cache'; // OFFLINE-FIRST: instala o cache de fetch ANTES de qualquer request
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// SENTRY — error tracking em produção. Sem DSN = desligado.
const SENTRY_DSN = 'https://80ba46ffe060f8851a79ded388bead7d@o4511611776663552.ingest.us.sentry.io/4511611790163968';
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
