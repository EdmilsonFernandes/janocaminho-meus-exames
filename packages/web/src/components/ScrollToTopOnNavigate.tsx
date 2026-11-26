import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTopOnNavigate — toda troca de tela começa no topo.
 *
 * Bug do app (dono, 26/11/26): no Android, quem estava no meio de "Exames" e abria "Diário de
 * saúde" caía no MEIO do diário. A rolagem é uma só (o documento) e ninguém zerava ao trocar de
 * rota — a tela nova herdava a posição da anterior.
 *
 * Regras:
 * - Só o CAMINHO conta. Troca de aba feita por query string (`?aba=...`) não mexe na rolagem.
 * - A primeira renderização (app abrindo) não rola.
 * - Voltar (botão, gesto, histórico) também volta ao topo — foi o que o dono pediu.
 * - Se a navegação aconteceu com um menu/ modal aberto (a gaveta do celular trava a rolagem do
 *   documento), o corpo não aceita `scrollTo` enquanto estiver travado: espera a trava sair e
 *   zera na sequência, senão a tela nova "gruda" na posição antiga quando a gaveta fecha.
 */
export const resetScroll = (host: Element | null, win?: Pick<Window, 'scrollTo'>, roots: Element[] = []) => {
  (win ?? window).scrollTo(0, 0);
  const zero = (node: Element | null) => { if (node && node.scrollTop) node.scrollTop = 0; };
  // Quando o shell rola dentro de um elemento (em vez do documento), zera cada ancestral rolável…
  for (let node = host?.parentElement ?? null; node; node = node.parentElement) zero(node);
  // …e as caixas de conteúdo do react-admin (não são ancestrais deste componente).
  roots.forEach(zero);
};

/** True enquanto um modal/gaveta do MUI mantém `overflow: hidden` no corpo (rolagem travada). */
export const isScrollLocked = (body: Pick<HTMLElement, 'style'> = document.body) => body.style.overflow === 'hidden';

export const ScrollToTopOnNavigate = () => {
  const { pathname } = useLocation();
  const host = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const go = () => resetScroll(host.current, undefined, Array.from(document.querySelectorAll('.RaLayout-content, .RaLayout-contentWithSidebar, .RaLayout-appFrame, main')));
    go();
    if (!isScrollLocked()) return;
    // Rolar de novo assim que a trava sair (a gaveta do menu leva ~0,3 s para fechar).
    const started = Date.now();
    let timer: number | undefined;
    const tick = () => {
      if (!isScrollLocked() || Date.now() - started > 2500) { go(); return; }
      timer = window.setTimeout(tick, 50);
    };
    timer = window.setTimeout(tick, 50);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return <span ref={host} hidden aria-hidden="true" />;
};

export default ScrollToTopOnNavigate;
