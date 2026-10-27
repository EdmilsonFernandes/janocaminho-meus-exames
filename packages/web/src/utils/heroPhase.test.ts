import { describe, it, expect } from 'vitest';
import { heroPhase } from './heroPhase';

/**
 * Hero do dashboard — regressão do bug 27/10/26: com o hook ainda carregando (score null,
 * 0 exames) o hero dizia "Começa com seu primeiro exame" para quem já tinha 13 exames.
 */
describe('heroPhase', () => {
  it('antes do load é SEMPRE carregamento — nunca "vazio"', () => {
    expect(heroPhase(false, null, 0)).toBe('loading');
    expect(heroPhase(false, 72, 13)).toBe('loading');
  });

  it('vazio só depois do load, sem score e sem exames', () => {
    expect(heroPhase(true, null, 0)).toBe('empty');
  });

  it('carregado com exames mas sem score → indisponível (não é "primeiro exame")', () => {
    expect(heroPhase(true, null, 3)).toBe('unscored');
  });

  it('score 0 é score (não confunde com ausência)', () => {
    expect(heroPhase(true, 0, 1)).toBe('scored');
    expect(heroPhase(true, 85, 13)).toBe('scored');
  });
});
