// @vitest-environment node
/**
 * useCelebrate — contrato do barramento de celebrações (convenção node do projeto, sem
 * jsdom): dispara o evento p/ o CelebrateFx, respeita o anti-spam de 30s, delega
 * credits_earned ao CreditRewardFx (pill da marca) e ignora first_exam (modal dedicado).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { celebrate, CELEBRATE_EVENT, CELEBRATE_COOLDOWN_MS } from './useCelebrate';

describe('celebrate — barramento', () => {
  const calls: { type: string; detail?: unknown }[] = [];
  // Cooldown é state de MÓDULO (persiste entre testes): cada teste começa 1min no futuro
  // do anterior — sempre fora da janela de 30s do teste anterior.
  const base = Date.parse('2026-10-12T12:00:00');
  let tick = 0;

  beforeEach(() => {
    calls.length = 0;
    tick += 1;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(base + tick * 60_000));
    vi.stubGlobal('window', {
      dispatchEvent: (e: { type: string; detail?: unknown }) => { calls.push({ type: e.type, detail: e.detail }); return true; },
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('dispara dx:celebrate com trigger e data', () => {
    celebrate('goal_reached');
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe(CELEBRATE_EVENT);
    expect(calls[0].detail).toEqual({ trigger: 'goal_reached', data: {} });
  });

  it('exam_extracted leva o count (nº de exames que ficaram prontos)', () => {
    celebrate('exam_extracted', { count: 3 });
    expect((calls[0].detail as any).data.count).toBe(3);
  });

  it('anti-spam: 2ª celebração em menos de 30s não dispara', () => {
    celebrate('goal_reached');
    vi.advanceTimersByTime(CELEBRATE_COOLDOWN_MS - 1);
    celebrate('premium_activated');
    expect(calls).toHaveLength(1);
  });

  it('depois de 30s volta a celebrar', () => {
    celebrate('goal_reached');
    vi.advanceTimersByTime(CELEBRATE_COOLDOWN_MS);
    celebrate('premium_activated');
    expect(calls).toHaveLength(2);
    expect((calls[1].detail as any).trigger).toBe('premium_activated');
  });

  it('credits_earned DELEGA ao CreditRewardFx (dx:credit-reward + creditsChanged), sem dx:celebrate', () => {
    celebrate('credits_earned', { amount: 50 });
    expect(calls).toHaveLength(2);
    expect(calls[0].type).toBe('dx:credit-reward');
    expect((calls[0].detail as { amount: number }).amount).toBe(50);
    expect(calls[1].type).toBe('creditsChanged');
  });

  it('credits_earned sem valor NÃO gasta o cooldown (próxima celebração passa)', () => {
    celebrate('credits_earned', { amount: 0 });
    expect(calls).toHaveLength(0);
    celebrate('goal_reached'); // imediatamente depois — deve passar
    expect(calls).toHaveLength(1);
  });

  it('first_exam é ignorado (modal Celebration dedicado)', () => {
    celebrate('first_exam');
    expect(calls).toHaveLength(0);
  });
});

describe('celebrate — SSR', () => {
  it('sem window não lança — silencioso', () => {
    expect(() => celebrate('goal_reached')).not.toThrow();
  });
});
