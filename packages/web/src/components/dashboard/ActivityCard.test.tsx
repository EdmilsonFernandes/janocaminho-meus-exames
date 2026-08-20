// @vitest-environment node
/**
 * ActivityView — testes de ESTADO via renderToString (SSR puro: sem jsdom/RTL,
 * zero dependências novas; a view é apresentação pura, então o HTML renderizado
 * é o contrato: skeleton, permissão negada, dados formatados, a11y do progress).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('react-admin', () => ({ useNotify: () => () => undefined }));
// AppCard/GradientButton puxam theme.ts → react-admin (precisa de browser). No teste de
// ESTADO, viram passthrough simples — o que se valida é o contrato da ActivityView.
vi.mock('../AppCard', () => ({ AppCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../GradientButton', () => ({ GradientButton: ({ children, ...p }: any) => <button {...p}>{children}</button> }));
vi.mock('../../utils/haptic', () => ({ hapticLight: () => undefined }));

import { ActivityView, PermissionRationaleContent } from './ActivityCard';

const theme = createTheme();
const shell = (el: React.ReactElement) => renderToString(<ThemeProvider theme={theme}>{el}</ThemeProvider>);

const noop = () => undefined;
const baseProps = {
  range: 'today' as const,
  onRange: noop,
  syncing: false,
  updatedAt: null,
  askOpen: false,
  asking: false,
  onAskOpen: noop,
  onAskClose: noop,
  onConfirm: noop,
  onSync: noop,
};

describe('ActivityView — estado loading (skeleton)', () => {
  it('renderiza skeletons e nenhum número (nada de "0" piscando)', () => {
    const html = shell(<ActivityView {...baseProps} phase="loading" days={null} />);
    expect(html).toContain('MuiSkeleton-root');
    expect(html).not.toContain('Passos hoje');
  });
});

describe('ActivityView — estado permissão negada', () => {
  it('mostra o convite (não o erro) com CTA de conectar', () => {
    const html = shell(<ActivityView {...baseProps} phase="denied" days={null} />);
    expect(html).toContain('Seus passos podem entrar aqui');
    expect(html).toContain('Conectar atividade');
    expect(html).not.toContain('MuiSkeleton-root');
  });
  it('o dialog explica leitura-only antes do popup nativo (conteúdo testável fora do Portal)', () => {
    const html = shell(<PermissionRationaleContent onConfirm={noop} onClose={noop} asking={false} />);
    expect(html).toContain('Conectar sua atividade');
    expect(html).toContain('Leitura apenas');
    expect(html).toContain('popup do próprio Android');
    expect(html).toContain('revogar a qualquer momento');
  });
});

describe('ActivityView — estado dados', () => {
  const days = [
    { date: '2026-08-19', steps: 9250, kcal: 2050, km: 6.25 },
    { date: '2026-08-18', steps: 4750, kcal: 1500, km: 3.1 },
    { date: '2026-08-17', steps: 8000, kcal: 1900, km: 5.0 },
  ];

  it('HOJE: passos do dia formatados + kcal/km com unidades sem "/dia"', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="today" />);
    expect(html).toContain('Passos hoje');
    expect(html).toContain('9.250');
    expect(html).toContain('2.050'); // kcal
    expect(html).toContain('6,3'); // km 6.25 → 1 casa
    expect(html).toContain('kcal'); // unidade sem "/dia" no modo hoje
  });

  it('HOJE com meta batida: check de meta + rótulo comemorativo', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="today" />);
    expect(html).toContain('meta de 8 mil passos batida');
  });

  it('HOJE abaixo da meta: porcentagem honesta no progressbar (a11y)', () => {
    const below = [{ date: '2026-08-19', steps: 4000, kcal: 1000, km: 2 }];
    const html = shell(<ActivityView {...baseProps} phase="data" days={below} range="today" />);
    expect(html).toContain('50% da meta de 8 mil');
    expect(html).toContain('aria-valuenow="50"');
  });

  it('7 DIAS: rótulo de média + kcal/km por dia', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="7d" />);
    expect(html).toContain('Média de passos (7 dias)');
    expect(html).toContain('kcal/dia');
    expect(html).toContain('km/dia');
  });

  it('sem dias: estado "sem dados" orienta (não inventa zero como dado)', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={[]} range="7d" />);
    expect(html).toContain('Sem dados ainda');
  });

  it('botão de sync acessível (aria-label) e desabilitado enquanto sincroniza', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} syncing />);
    expect(html).toContain('aria-label="Atualizar e sincronizar atividade"');
    expect(html).toContain('disabled');
  });
});
