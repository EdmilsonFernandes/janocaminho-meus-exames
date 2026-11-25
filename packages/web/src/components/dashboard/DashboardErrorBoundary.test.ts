// @vitest-environment node
/**
 * DashboardErrorBoundary — o erro capturado tem de chegar ao Sentry (antes ficava só no console
 * e ninguém sabia que o painel tinha caído). Chamada direta do ciclo de vida: em SSR o React não
 * executa componentDidCatch, e o contrato que importa é "capturou → reportou, sem lançar".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

import { DashboardErrorBoundary } from './DashboardErrorBoundary';

describe('DashboardErrorBoundary → Sentry', () => {
  beforeEach(() => { captureException.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('reporta o erro com a pilha de componentes e a tentativa', () => {
    const b = new DashboardErrorBoundary({ children: null });
    const err = new Error('Rendered fewer hooks than expected');
    b.componentDidCatch(err, { componentStack: '\n    at SportsDashboard' });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [reported, ctx] = captureException.mock.calls[0];
    expect(reported).toBe(err);
    expect(ctx.tags).toEqual({ boundary: 'dashboard', attempt: '0' });
    expect(ctx.extra.componentStack).toContain('SportsDashboard');
  });

  it('se o Sentry falhar, o boundary não lança (a tela de erro continua aparecendo)', () => {
    captureException.mockImplementation(() => { throw new Error('sentry fora'); });
    const b = new DashboardErrorBoundary({ children: null });
    expect(() => b.componentDidCatch(new Error('x'), {})).not.toThrow();
  });
});
