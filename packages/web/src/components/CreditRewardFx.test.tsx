// @vitest-environment node
/**
 * CreditRewardFx — contrato + lógica do disparo (convenção node/renderToString do projeto,
 * sem jsdom/RTL). O portal só existe com reward ativo E document (guard p/ SSR: em node
 * renderiza nada — testado aqui). celebrateCredits: dispara o par de eventos (pill +
 * atualização do chip) e IGNORA valores inválidos (guard do farm visual).
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { CreditRewardFx, celebrateCredits } from './CreditRewardFx';

describe('CreditRewardFx — componente', () => {
  it('sem recompensa não renderiza nada (nem quebra fora do DOM — guard de SSR)', () => {
    const html = renderToString(
      <ThemeProvider theme={createTheme()}>
        <CreditRewardFx />
      </ThemeProvider>,
    );
    expect(html).toBe('');
  });
});

describe('celebrateCredits — disparo', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const stubWindow = () => {
    const calls: { type: string; detail?: unknown }[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (e: { type: string; detail?: unknown }) => { calls.push({ type: e.type, detail: e.detail }); return true; },
    });
    return calls;
  };

  it('dispara a recompensa E o creditsChanged (chip do saldo atualiza junto)', () => {
    const calls = stubWindow();
    celebrateCredits(3);
    expect(calls).toHaveLength(2);
    expect(calls[0].type).toBe('dx:credit-reward');
    expect((calls[0].detail as { amount: number }).amount).toBe(3);
    expect(calls[1].type).toBe('creditsChanged');
  });

  it('ignora valores inválidos (0 e negativo não disparam nada)', () => {
    const calls = stubWindow();
    celebrateCredits(0);
    celebrateCredits(-5);
    expect(calls).toHaveLength(0);
  });

  it('sem window (SSR/Node puro) não lança — silencioso', () => {
    expect(() => celebrateCredits(3)).not.toThrow();
  });
});
