import { describe, it, expect } from 'vitest';
import { decideBackAction } from './backNavigation';

/**
 * Testa a LÓGICA do handler de voltar do Android (extraída p/ decideBackAction).
 * O gesto-fecha-app em si é comportamento do OS (só num device), mas a decisão
 * "volta / vai pro dashboard / engole" é JS puro e fica provada aqui.
 */
describe('decideBackAction — handler do voltar (Android/Capacitor)', () => {
  it('volta no histórico in-app quando há tela anterior (idx > 0)', () => {
    expect(decideBackAction({ historyState: { idx: 1 }, pathname: '/exams', inAppStackLength: 2 })).toBe('back');
    expect(decideBackAction({ historyState: { idx: 3 }, pathname: '/exams/123', inAppStackLength: 4 })).toBe('back');
  });

  it('NÃO volta na raiz após ter navegado — reprovação exata do bug do gesto sair do app', () => {
    // Cenário real do bug: Início → Exames → Início. window.history.length fica >1 PRA SEMPRE,
    // mas idx volta a 0. A lógica antiga (window.history.length > 1) chamava history.back() no
    // índice 0 do WebView → SAÍA do app no gesto. A nova (idx > 0) corretamente ENGOLE o back.
    expect(decideBackAction({ historyState: { idx: 0 }, pathname: '/', inAppStackLength: 1 })).toBe('stay');
    // Mesmo simulando o length alto (não passado à função, mas o ponto é: idx=0 manda ficar).
    expect(decideBackAction({ historyState: { idx: 0 }, pathname: '/', inAppStackLength: 5 })).toBe('stay');
  });

  it('vai ao dashboard (fica no app) quando não há histórico mas está fora da raiz (deep link)', () => {
    expect(decideBackAction({ historyState: { idx: 0 }, pathname: '/exams', inAppStackLength: 1 })).toBe('go-home');
    expect(decideBackAction({ historyState: { idx: 0 }, pathname: '/relatorio', inAppStackLength: 1 })).toBe('go-home');
  });

  it('usa inAppStack como fallback quando idx é nulo (antes da 1ª navegação)', () => {
    expect(decideBackAction({ historyState: null, pathname: '/exams', inAppStackLength: 2 })).toBe('back');
    expect(decideBackAction({ historyState: null, pathname: '/', inAppStackLength: 1 })).toBe('stay');
  });

  it('engole o back no dashboard mesmo sem idx nem histórico', () => {
    expect(decideBackAction({ historyState: null, pathname: '/', inAppStackLength: 1 })).toBe('stay');
  });
});
