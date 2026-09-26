// @vitest-environment node
/**
 * Celebration — contrato de render via renderToString (SSR puro, sem jsdom/RTL —
 * mesma convenção do ActivityCard.test): fechado = nada; aberto = título/CTA/a11y.
 * A confetti canvas não roda em node (guards de window/rAF) — só o contrato de UI.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { Celebration } from './Celebration';

const render = (open: boolean, firstName?: string) => renderToString(
  <ThemeProvider theme={createTheme()}>
    <Celebration open={open} firstName={firstName} onDone={() => {}} onCta={() => {}} />
  </ThemeProvider>,
);

describe('Celebration — momento do 1º exame', () => {
  it('fechado não renderiza nada', () => {
    expect(render(false)).toBe('');
  });

  it('aberto renderiza o momento completo (título, CTA, saída e a11y de dialog)', () => {
    const html = render(true, 'Ana');
    expect(html).toContain('primeiro exame virou análise');
    expect(html).toContain('Ana'); // personaliza com o primeiro nome
    expect(html).toContain('Ver minha análise');
    expect(html).toContain('Continuar no painel');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal');
  });

  it('funciona sem primeiro nome (copy neutra)', () => {
    const html = render(true);
    // SSR separa os nós de texto ("Seu" condicional) — o trecho estável é o sufixo.
    expect(html).toContain('primeiro exame virou análise');
    expect(html).toContain('🎉'); // emoji do título presente
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });
});
