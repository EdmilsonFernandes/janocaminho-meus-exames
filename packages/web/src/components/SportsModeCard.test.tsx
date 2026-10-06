// @vitest-environment node
/**
 * SportsModeCard — testes de ESTADO via renderToString (SSR puro, mesmo padrão do
 * ActivityCard.test). Contrato E1.5: kill-switch do /api/public/config esconde o card;
 * sem premium = CTA "Disponível no Premium"; premium = toggle; ON = chip de ativado.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const state = vi.hoisted(() => ({ on: false }));
vi.mock('react-admin', () => ({
  useNotify: () => () => undefined,
  useStore: () => [state.on, () => undefined],
  defaultTheme: {},
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => undefined }));
// Base não faz rede no render (fetch só em ações) — config só p/ importar sem browser.
vi.mock('../config', () => ({
  API_URL: '/api', token: () => 't', apiHeaders: () => ({}),
  fetchPublicConfig: async () => ({ sportsMode: { enabled: 1 } }),
}));

import { SportsModeCardBase } from './SportsModeCard';

const theme = createTheme();
const shell = (el: React.ReactElement) => renderToString(<ThemeProvider theme={theme}>{el}</ThemeProvider>);

describe('SportsModeCardBase — kill-switch admin (E1.5)', () => {
  it('enabled=false (default do server) → o card NEM EXISTE', () => {
    const html = shell(<SportsModeCardBase pid="p1" enabled={false} premium />);
    expect(html).not.toContain('Saúde Esportiva');
    expect(html).not.toContain('Disponível no Premium');
  });
});

describe('SportsModeCardBase — gate premium (E1.5)', () => {
  it('sem premium → CTA "Disponível no Premium" (leva a /planos), sem toggle', () => {
    const html = shell(<SportsModeCardBase pid="p1" enabled premium={false} />);
    expect(html).toContain('Saúde Esportiva');
    expect(html).toContain('Disponível no Premium');
    expect(html).not.toContain('Modo esportivo ativado');
  });
});

describe('SportsModeCardBase — premium + toggle (E1.5 MVP)', () => {
  it('premium com modo OFF → toggle visível, sem chip de ativado', () => {
    state.on = false;
    const html = shell(<SportsModeCardBase pid="p1" enabled premium />);
    expect(html).toContain('Saúde Esportiva');
    expect(html).not.toContain('Modo esportivo ativado');
  });

  it('premium com modo ON → chip "Modo esportivo ativado" + form de substância (E1.4)', () => {
    state.on = true;
    const html = shell(<SportsModeCardBase pid="p1" enabled premium />);
    expect(html).toContain('Modo esportivo ativado');
    expect(html).toContain('Declarar substância');
    expect(html).toContain('nunca esconde alterações'); // copy de segurança (D3)
  });
});
