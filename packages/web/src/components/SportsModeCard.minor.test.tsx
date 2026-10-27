// @vitest-environment node
/**
 * SportsModeCard — menor de 18 (decisão do dono 27/10/26): com o GET dizendo
 * eligible=false, o card vira só um aviso — sem alternador. Mesmo padrão SSR do
 * SportsModeCard.test (renderToString, sem DOM/RTL); o cache do hook é semeado pelo
 * mesmo caminho do app (fetch → handleSportsProfileChanged).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('react-admin', () => ({
  useNotify: () => () => undefined,
  useStore: () => [false, () => undefined],
  defaultTheme: {},
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => () => undefined,
  useSearchParams: () => [new URLSearchParams(), () => undefined],
}));
vi.mock('../config', () => ({
  API_URL: '/api', token: () => 't', apiHeaders: () => ({}),
  fetchPublicConfig: async () => ({ sportsMode: { enabled: 1 } }),
}));

import { SportsModeCardBase } from './SportsModeCard';
import { handleSportsProfileChanged } from '../hooks/useSportsProfile';

const theme = createTheme();
const shell = (el: React.ReactElement) => renderToString(<ThemeProvider theme={theme}>{el}</ThemeProvider>);
const seed = async (pid: string, eligible: boolean) => {
  (globalThis as any).fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ profile: null, enabled: 1, eligible }) });
  await handleSportsProfileChanged(pid);
};

describe('SportsModeCardBase — menor de 18', () => {
  it('eligible=false → aviso "a partir dos 18 anos" e NENHUM alternador', async () => {
    await seed('kid', false);
    const html = shell(<SportsModeCardBase pid="kid" enabled premium />);
    expect(html).toContain('Disponível a partir dos 18 anos');
    expect(html).not.toContain('MuiSwitch');
  });

  it('maior de idade → card normal, sem o aviso', async () => {
    await seed('adulto', true);
    const html = shell(<SportsModeCardBase pid="adulto" enabled premium />);
    expect(html).not.toContain('Disponível a partir dos 18 anos');
    expect(html).toContain('Saúde Esportiva');
  });
});
