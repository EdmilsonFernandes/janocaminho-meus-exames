/**
 * Teclado cobrindo o campo de texto (APK, Android 15+).
 *
 * Com a tela de ponta a ponta o teclado abre POR CIMA do WebView: a página não encolhe e não fica
 * sabendo, então o campo do chat ficava escondido. O app nativo (MainActivity.watchKeyboard) avisa
 * a altura do teclado pelo evento "dx:ime". Aqui a página:
 *   1) calcula quanto está de fato COBERTO (desconta o que a janela já encolheu, em aparelhos
 *      onde ela encolhe: assim nunca conta em dobro);
 *   2) publica o valor na variável CSS --dx-kb e no evento "dx:kb" (useKeyboardInset usa);
 *   3) abre espaço no fim da página e rola até o campo que está sendo digitado.
 * No navegador (sem o evento nativo) nada disto roda.
 */
let baseline = 0; // altura da janela sem teclado
let covered = 0;

/** Quanto do conteúdo o teclado cobre agora, em px de CSS. Função pura (testável). */
export function coveredByKeyboard(imeHeight: number, baselineHeight: number, currentHeight: number): number {
  if (!(imeHeight > 0)) return 0;
  const alreadyShrunk = Math.max(0, baselineHeight - currentHeight);
  return Math.max(0, Math.round(imeHeight - alreadyShrunk));
}

export const keyboardCovered = (): number => covered;

function revealFocusedField() {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName) && !el.isContentEditable) return;
  const rect = el.getBoundingClientRect();
  const visibleBottom = window.innerHeight - covered;
  if (rect.bottom > visibleBottom - 12 || rect.top < 0) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function installKeyboardGuard(): void {
  if (typeof window === 'undefined') return;
  baseline = window.innerHeight;
  window.addEventListener('dx:ime', (ev) => {
    const ime = Number((ev as CustomEvent<{ height?: number }>).detail?.height) || 0;
    if (ime <= 0) baseline = Math.max(baseline, window.innerHeight);
    covered = coveredByKeyboard(ime, baseline, window.innerHeight);
    const root = document.documentElement;
    root.style.setProperty('--dx-kb', `${covered}px`);
    // espaço no fim da página: sem ele não há para onde rolar quando o campo está no rodapé
    document.body.style.paddingBottom = covered ? `${covered}px` : '';
    window.dispatchEvent(new CustomEvent('dx:kb', { detail: { covered } }));
    if (covered) window.setTimeout(revealFocusedField, 60);
  });
  // trocou de campo com o teclado já aberto
  window.addEventListener('focusin', () => { if (covered) window.setTimeout(revealFocusedField, 60); });
  window.addEventListener('resize', () => { if (!covered) baseline = window.innerHeight; });
}
