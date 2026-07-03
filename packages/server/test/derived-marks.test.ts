import { describe, it, expect } from 'vitest';
import { bmi, egfr, homaIr, bmiBand, egfrBand, homaIrBand } from '../src/analysis/derived-markers';

describe('derived-markers', () => {
  describe('bmi (IMC) — OMS', () => {
    it('80kg / 1.75m -> 26.1 (sobrepeso)', () => {
      expect(bmi(80, 175)).toBeCloseTo(26.1, 1);
      expect(bmiBand(bmi(80, 175))).toBe('attention');
    });
    it('70kg / 1.75m -> 22.9 (normal)', () => {
      expect(bmi(70, 175)).toBeCloseTo(22.9, 1);
      expect(bmiBand(bmi(70, 175))).toBe('normal');
    });
    it('110kg / 1.70m -> obesidade (alerta)', () => {
      expect(bmiBand(bmi(110, 170))).toBe('alert');
    });
    it('entradas inválidas -> null', () => {
      expect(bmi(null, 175)).toBeNull();
      expect(bmi(80, null)).toBeNull();
      expect(bmi(0, 175)).toBeNull();
    });
  });

  describe('egfr (CKD-EPI 2021)', () => {
    it('homem 50a, creat 1.0 -> ~92 (função renal normal)', () => {
      const v = egfr(1.0, 50, 'male');
      expect(v).not.toBeNull();
      expect(v!).toBeGreaterThan(85);
      expect(v!).toBeLessThan(100);
      expect(egfrBand(v)).toBe('normal');
    });
    it('mulher 60a, creat 1.4 -> ~43 (DRC estágio 3, atenção)', () => {
      const v = egfr(1.4, 60, 'female');
      expect(v!).toBeGreaterThanOrEqual(30);
      expect(v!).toBeLessThan(60);
      expect(egfrBand(v)).toBe('attention');
    });
    it('mulher 70a, creat 2.0 -> <30 (DRC avançada, alerta)', () => {
      const v = egfr(2.0, 70, 'female');
      expect(v!).toBeLessThan(30);
      expect(egfrBand(v)).toBe('alert');
    });
    it('inversamente proporcional à creatinina', () => {
      expect(egfr(2.5, 40, 'male')!).toBeLessThan(egfr(0.9, 40, 'male')!);
    });
    it('sem sexo -> null (eGFR é sexo-dependente)', () => {
      expect(egfr(1.0, 50, undefined)).toBeNull();
      expect(egfr(1.0, 50, null)).toBeNull();
    });
    it('entradas inválidas -> null', () => {
      expect(egfr(null, 50, 'male')).toBeNull();
      expect(egfr(1.0, null, 'male')).toBeNull();
      expect(egfr(0, 50, 'male')).toBeNull();
    });
  });

  describe('homaIr (Matthews 1985)', () => {
    it('glic 90 + ins 10 -> 2.22 (normal)', () => {
      expect(homaIr(90, 10)).toBeCloseTo(2.22, 1);
      expect(homaIrBand(homaIr(90, 10))).toBe('normal');
    });
    it('glic 100 + ins 15 -> 3.70 (resistência insulínica)', () => {
      expect(homaIr(100, 15)).toBeCloseTo(3.70, 1);
      expect(homaIrBand(homaIr(100, 15))).toBe('attention');
    });
    it('sem insulina -> null (HOMA exige insulina)', () => {
      expect(homaIr(90, null)).toBeNull();
      expect(homaIrBand(homaIr(90, null))).toBeNull();
    });
  });
});
