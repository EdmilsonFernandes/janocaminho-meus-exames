// @vitest-environment node
/**
 * ActivityView — testes de ESTADO via renderToString (SSR puro: sem jsdom/RTL,
 * zero dependências novas; a view é apresentação pura, então o HTML renderizado
 * é o contrato: skeleton, permissão negada, dados formatados, a11y do progress).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('react-admin', () => ({ useNotify: () => () => undefined, defaultTheme: {} }));
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
  onHide: noop,
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
  it('BRANDING Google premium: G multicolor + Health Connect + cadeado de segurança', () => {
    const html = shell(<ActivityView {...baseProps} phase="denied" days={null} />);
    expect(html).toContain('#EA4335'); // vermelho Google
    expect(html).toContain('#4285F4'); // azul Google
    expect(html).toContain('#34A853'); // verde Google
    expect(html).toContain('Google Health Connect');
    expect(html).toContain('Dados seguros'); // cadeado + texto
    expect(html).toContain('#34A853'); // botão verde Google
  });
  it('quem não quer o card consegue OCULTÁ-LO (botão com aria-label, sem card eterno)', () => {
    const html = shell(<ActivityView {...baseProps} phase="denied" days={null} />);
    expect(html).toContain('aria-label="Ocultar card de atividade"');
    expect(html).toContain('Perfil → Acessibilidade'); // tooltip ensina o caminho de volta
  });
  it('o dialog explica leitura-only antes do popup nativo (conteúdo testável fora do Portal)', () => {
    const html = shell(<PermissionRationaleContent onConfirm={noop} onClose={noop} asking={false} />);
    expect(html).toContain('Leitura apenas');
    expect(html).toContain('popup do próprio Android');
    expect(html).toContain('revogar a qualquer momento');
  });

  it('BRANDING Health Connect exigido (guidelines): nome + "do Google" no ponto de conexão', () => {
    const html = shell(<PermissionRationaleContent onConfirm={noop} onClose={noop} asking={false} />);
    expect(html).toContain('Health Connect');
    expect(html).toContain('do Google');
  });

  it('falha de conexão aparece DENTRO do dialog (não só toast) com retry a 1 toque', () => {
    const html = shell(<PermissionRationaleContent onConfirm={noop} onClose={noop} asking={false} error="Seu Health Connect precisa de atualização — abra a Play Store" />);
    expect(html).toContain('precisa de atualização');
    expect(html).toContain('Continuar'); // botão segue clicável p/ tentar de novo
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
    expect(html).toContain('meta batida');
  });

  it('HOJE abaixo da meta: porcentagem honesta no progressbar (a11y)', () => {
    const below = [{ date: '2026-08-19', steps: 4000, kcal: 1000, km: 2 }];
    const html = shell(<ActivityView {...baseProps} phase="data" days={below} range="today" />);
    expect(html).toContain('50% da meta');
    expect(html).toContain('aria-valuenow="50"');
  });

  it('7 DIAS: destaca o total do período e explica a média diária', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="7d" />);
    expect(html).toContain('Passos em 7 dias');
    expect(html).toContain('22 mil');
    expect(html).toContain('média 7.333/dia');
    expect(html).toContain('Média 7 dias');
  });

  it('HOJE com passos mas SEM calorias: explica o lote do HC (não mente com um 0 mudo)', () => {
    const partial = [{ date: '2026-08-27', steps: 1060, kcal: 0, km: 0.6 }];
    const html = shell(<ActivityView {...baseProps} phase="data" days={partial} range="today" />);
    expect(html).toContain('ainda não chegaram ao Health Connect');
  });

  it('HOJE com calorias presentes: hint de lote NÃO aparece', () => {
    const full = [{ date: '2026-08-27', steps: 1060, kcal: 517, km: 0.6 }];
    const html = shell(<ActivityView {...baseProps} phase="data" days={full} range="today" />);
    expect(html).not.toContain('ainda não chegaram ao Health Connect');
  });

  it('hora da última leitura aparece SEM restrição de tela (mobile inclusive)', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="today" updatedAt={new Date('2026-08-27T09:12:00')} />);
    expect(html).toContain('09:12');
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
  it('RING de meta (Google Fit-like): progressbar a11y com o percentual do período', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="today" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow'); // percentual vivo no anel
    expect(html).toContain('aria-label="Meta de 8.000 passos');
  });
});

describe('ActivityView — fonte CLOUD (web, sem bridge nativa)', () => {
  const days = [{ date: '2026-08-19', steps: 5214, kcal: 628, km: 3.46 }];
  const iso = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

  it('carimba "Sincronizado há X" e NÃO oferece botão de sync (quem sincroniza é o APK)', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="7d" source="cloud" syncedAtISO={iso(2)} />);
    // renderToString separa os text nodes com "<!-- -->" — asserções por fragmento.
    expect(html).toContain('Sincronizado');
    expect(html).toContain('há 2 horas');
    expect(html).not.toContain('aria-label="Atualizar e sincronizar atividade"');
  });

  it('stale (>24h): acrescenta hint para abrir o app no celular', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="7d" source="cloud" syncedAtISO={iso(80)} />);
    expect(html).toContain('há 3 dias');
    expect(html).toContain('atualize pelo app');
  });

  it('range "Hoje" desabilitado no cloud (dado do dia chega pela sincronização do app)', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="7d" source="cloud" syncedAtISO={iso(2)} />);
    expect(html).toContain('O dado de hoje chega pela sincronização');
  });

  it('fonte device (default): botão de sync presente', () => {
    const html = shell(<ActivityView {...baseProps} phase="data" days={days} range="7d" />);
    expect(html).toContain('aria-label="Atualizar e sincronizar atividade"');
  });
});
