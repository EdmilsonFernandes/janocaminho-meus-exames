import { describe, it, expect } from 'vitest';
import { canonicalName } from '../src/utils/normalize';

/** Sinônimos de analito colapsam num nameCanonical ÚNICO — senão a mesma substância vira
 *  2 séries na tendência (bug 2026-08-16: "Fsh - Hormonio Foliculo Estimulante" × "FSH"). */
describe('aliases de analitos (canonicalName)', () => {
  it('FSH: sigla e expansão do nome viram o MESMO canonical', () => {
    const variants = ['FSH', 'Fsh - Hormonio Foliculo Estimulante', 'HORMONIO FOLICULO ESTIMULANTE', 'FOLICULO ESTIMULANTE'];
    const out = new Set(variants.map((v) => canonicalName(v)));
    expect(out.size).toBe(1);
    expect([...out][0]).toBe('FSH');
  });

  it('LH: idem', () => {
    const variants = ['LH', 'LH - HORMONIO LUTEINIZANTE', 'HORMONIO LUTEINIZANTE'];
    expect(new Set(variants.map((v) => canonicalName(v))).size).toBe(1);
  });

  it('TSH continua colapsando (regressão: padrão existente)', () => {
    expect(canonicalName('TSH - TIREOESTIMULANTE')).toBe('TSH');
    expect(canonicalName('HORMÔNIO TIREOESTIMULANTE')).toBe('TSH');
  });

  it('PCR ultrasensível continua em PCR (regressão do PhenoAge)', () => {
    expect(canonicalName('PROTEÍNA C REATIVA ULTRASSENSÍVEL')).toBe('PCR');
  });

  it('Testosterona LIVRE ≠ TOTAL (não colapsar escalas diferentes)', () => {
    expect(canonicalName('TESTOSTERONA LIVRE')).not.toBe(canonicalName('TESTOSTERONA TOTAL'));
  });
});
