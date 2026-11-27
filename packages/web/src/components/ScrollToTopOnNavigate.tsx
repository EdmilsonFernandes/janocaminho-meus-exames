import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * ScrollToTopOnNavigate — tela nova começa no topo; VOLTAR devolve a pessoa onde ela estava.
 *
 * Bug do app (dono, 26/11/26): no Android, quem estava no meio de "Exames" e abria "Diário de
 * saúde" caía no MEIO do diário. A rolagem é uma só (o documento) e ninguém zerava ao trocar de
 * rota — a tela nova herdava a posição da anterior.
 *
 * Voltar (27/11/26, medido no Android): na versão de 26/11 o Voltar também ia para o topo. A queixa
 * era a tela NOVA herdar a posição; voltar para o topo fazia quem desceu até o 5º exame da lista,
 * abriu e voltou, procurar de novo. No Android (e em todo app de sistema) o Voltar devolve a tela
 * como estava. Cada entrada do histórico guarda a sua posição.
 *
 * Regras:
 * - Só o CAMINHO conta. Troca de aba feita por query string (`?aba=...`) não mexe na rolagem.
 * - A primeira renderização (app abrindo) não rola.
 * - Avançar (link, menu, rodapé) → topo. Voltar (botão, gesto, histórico) → posição guardada.
 * - A tela que volta pode ainda estar carregando (mais baixa que a posição guardada): tenta de novo
 *   a cada quadro por até 2,5 s; se a pessoa tocar na tela nesse meio-tempo, para de mexer.
 * - Se a navegação aconteceu com um menu/ modal aberto (a gaveta do celular trava a rolagem do
 *   documento), o corpo não aceita `scrollTo` enquanto estiver travado: espera a trava sair e
 *   zera na sequência, senão a tela nova "gruda" na posição antiga quando a gaveta fecha.
 */
export const resetScroll = (host: Element | null, win?: { scrollTo: (options: ScrollToOptions) => void }, roots: Element[] = []) => {
  // 'instant': o <html> tem scroll-behavior: smooth, então scrollTo(0, 0) ANIMAVA a subida —
  // a tela nova aparecia no meio e deslizava até o topo, o que parecia lentidão.
  (win ?? window).scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const zero = (node: Element | null) => { if (node && node.scrollTop) node.scrollTop = 0; };
  // Quando o shell rola dentro de um elemento (em vez do documento), zera cada ancestral rolável…
  for (let node = host?.parentElement ?? null; node; node = node.parentElement) zero(node);
  // …e as caixas de conteúdo do react-admin (não são ancestrais deste componente).
  roots.forEach(zero);
};

/** True enquanto um modal/gaveta do MUI mantém `overflow: hidden` no corpo (rolagem travada). */
export const isScrollLocked = (body: Pick<HTMLElement, 'style'> = document.body) => body.style.overflow === 'hidden';

/** Posição de rolagem de cada entrada do histórico (chave do react-router). */
const MAX_SAVED = 60;
export const savedScroll = new Map<string, number>();
export const saveScroll = (key: string, y: number) => {
  savedScroll.delete(key);
  savedScroll.set(key, Math.max(0, Math.round(y)));
  while (savedScroll.size > MAX_SAVED) savedScroll.delete(savedScroll.keys().next().value as string);
};

/** O que fazer com a rolagem ao chegar numa tela: voltar para onde estava, ou topo. */
export const planScroll = (navType: string, saved: number | undefined): { mode: 'restore'; y: number } | { mode: 'top' } =>
  navType === 'POP' && saved != null && saved > 0 ? { mode: 'restore', y: saved } : { mode: 'top' };

const RESTORE_FOR_MS = 2500;

export const ScrollToTopOnNavigate = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const { pathname } = location;
  const host = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  const keyRef = useRef(location.key);

  // Rolagem feita pela pessoa fica guardada na entrada ATUAL do histórico. A chave troca antes de
  // a tela nova mexer na rolagem, para o topo da tela nova não sobrescrever a posição da anterior.
  useLayoutEffect(() => {
    keyRef.current = location.key;
    try { if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'; } catch { /* ignore */ }
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; saveScroll(keyRef.current, window.scrollY); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [location.key]);

  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const plan = planScroll(navType, savedScroll.get(location.key));

    if (plan.mode === 'restore') {
      let raf = 0;
      let stop = false;
      const started = Date.now();
      const quit = () => { stop = true; };
      window.addEventListener('touchstart', quit, { once: true, passive: true });
      window.addEventListener('wheel', quit, { once: true, passive: true });
      const tick = () => {
        if (stop) return;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: Math.min(plan.y, Math.max(0, max)), left: 0, behavior: 'instant' });
        if (max >= plan.y - 2 || Date.now() - started > RESTORE_FOR_MS) return;
        raf = requestAnimationFrame(tick);
      };
      tick();
      return () => {
        stop = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('touchstart', quit);
        window.removeEventListener('wheel', quit);
      };
    }

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
    // Só o caminho decide (aba por query string não mexe na rolagem); a chave e o tipo de navegação
    // são lidos no momento da troca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return <span ref={host} hidden aria-hidden="true" />;
};

export default ScrollToTopOnNavigate;
