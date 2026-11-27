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

/** O mínimo de um elemento que `closeTopModal` usa (DOM real ou de teste). */
type ModalLike = Pick<Element, 'getAttribute' | 'dispatchEvent'> & { classList: { contains(c: string): boolean } };

/**
 * Voltar com diálogo aberto (27/11/26, confirmado no Android): o Voltar mudava a tela POR BAIXO e
 * o diálogo (ex.: pagamento PIX) continuava aberto por cima. No Android o Voltar fecha primeiro o
 * que está no topo. Aqui: acha o modal do MUI mais de cima (diálogo, folha, menu) e manda o mesmo
 * "Esc" que o teclado mandaria — quem fecha é o próprio componente, pelas regras dele. Se ele não
 * aceitar fechar assim, o Voltar é engolido (nunca navega por baixo de um diálogo).
 * Devolve true quando havia um modal aberto.
 */
export function closeTopModal(
  doc: { querySelectorAll(sel: string): ArrayLike<ModalLike> } = document,
  makeEscape: () => Event = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
): boolean {
  const open = Array.from(doc.querySelectorAll('.MuiModal-root')).filter(
    (m) => !m.classList.contains('MuiModal-hidden') && m.getAttribute('aria-hidden') !== 'true',
  );
  const top = open[open.length - 1];
  if (!top) return false;
  top.dispatchEvent(makeEscape());
  return true;
}
