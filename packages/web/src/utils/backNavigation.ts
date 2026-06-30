/**
 * Decisão PURA do handler de voltar do Android (Capacitor `backButton`).
 * Extraída de App.tsx para ser testável deterministicamente — o handler native
 * só consegue ser exercitado de verdade num device/emulador (o gesto que FECHA
 * o app é comportamento do OS, não reprodutível em browser). Mas a LÓGICA de
 * "o que fazer ao voltar" é JS puro e vive aqui.
 *
 * Sinal confiável de "dá pra voltar no app": window.history.state.idx (índice
 * REAL do histórico do react-router, que DIMINUI ao voltar). NUNCA usar
 * window.history.length — ele só cresce; após a 1ª navegação fica travado em >1
 * e history.back() no índice 0 do WebView SAÍA do app no gesto de voltar.
 */
export type BackAction = 'back' | 'go-home' | 'stay';

export function decideBackAction(opts: {
  historyState: { idx?: number } | null;
  pathname: string;
  inAppStackLength: number;
}): BackAction {
  const { historyState, pathname, inAppStackLength } = opts;
  const routerIdx = historyState && typeof historyState.idx === 'number' ? historyState.idx : null;
  // idx é nulo só antes da 1ª navegação (estado inicial) — aí o fallback é a pilha própria.
  const canGoBack = routerIdx != null ? routerIdx > 0 : inAppStackLength > 1;
  if (canGoBack) return 'back'; // volta no histórico IN-APP (nunca sai do app)
  if (pathname !== '/' && pathname !== '') return 'go-home'; // deep-link sem histórico → dashboard
  return 'stay'; // raiz: engole o back (sai só pelo botão home do Android)
}
