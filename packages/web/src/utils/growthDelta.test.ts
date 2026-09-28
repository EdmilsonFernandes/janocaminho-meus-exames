// @vitest-environment node
/**
 * growthDelta (bônus G4) — linha "cresceu X cm e Y kg desde <mês/ano>":
 * primeiro vs último registro, só dimensões com 2+ pontos e ganho > 0.
 */
import { describe, expect, it } from 'vitest';
import { growthDelta, type GrowthPoint } from './growth';

const w = (date: string, value: number): GrowthPoint => ({ date, value });

describe('growthDelta', () => {
  it('menos de 2 registros em ambas as séries → null', () => {
    expect(growthDelta([], [])).toBeNull();
    expect(growthDelta([w('2025-03-10', 12)], [w('2025-03-10', 87)])).toBeNull();
  });

  it('cm e kg juntos, desde o mês/ano do registro mais antigo', () => {
    const d = growthDelta(
      [w('2025-03-10', 12.2), w('2025-09-10', 13.6)],
      [w('2025-03-15', 87.0), w('2025-09-10', 95.2)],
    );
    expect(d).not.toBeNull();
    expect(d!.parts).toBe('8,2 cm e 1,4 kg'); // pt-BR, 1 casa decimal
    expect(d!.sinceLabel).toBe('março de 2025'); // mais antigo = peso 10/03
  });

  it('só uma dimensão qualificada → só ela aparece', () => {
    const d = growthDelta([], [w('2024-01-05', 120), w('2024-12-05', 131.5)]);
    expect(d!.parts).toBe('11,5 cm');
    expect(d!.sinceLabel).toBe('janeiro de 2024');
  });

  it('diferença zero ou negativa fica de fora (dado ruim não vira mensagem)', () => {
    // peso não mudou (0) → só altura entra
    const a = growthDelta(
      [w('2025-01-10', 20), w('2025-06-10', 20)],
      [w('2025-01-10', 110), w('2025-06-10', 114)],
    );
    expect(a!.parts).toBe('4,0 cm');
    // nenhuma subiu → null
    const b = growthDelta(
      [w('2025-01-10', 20), w('2025-06-10', 19.5)],
      [w('2025-01-10', 110), w('2025-06-10', 109)],
    );
    expect(b).toBeNull();
  });

  it('entrada fora de ordem usa o mais antigo e o mais novo por DATA', () => {
    const d = growthDelta(
      [w('2025-09-10', 13.6), w('2025-03-10', 12.2)], // invertido
      [],
    );
    expect(d!.parts).toBe('1,4 kg');
    expect(d!.sinceLabel).toBe('março de 2025');
  });

  it('valores inválidos (0/negativos/datas ruins) são ignorados', () => {
    const d = growthDelta(
      [w('2025-03-10', 0), w('2025-04-10', 12), w('2025-09-10', 13)],
      [],
    );
    expect(d!.parts).toBe('1,0 kg');
    expect(growthDelta([w('não-data', 12), w('2025-09-10', 13)], [])).toBeNull();
  });
});
