import { describe, it, expect } from 'vitest';
import { computeUploadCost } from './credits';

// Regras canônicas (espelham o default do config: freeCost=1, premiumFreeQuota=6, premiumCost=5).
const rules = { freeCost: 1, premiumFreeQuota: 6, premiumCost: 5 };

describe('computeUploadCost — cobrança de upload de exame', () => {
  describe('Plano FREE', () => {
    it('sempre cobra freeCost (1 crédito), do 1º ao N-ésimo envio', () => {
      expect(computeUploadCost(false, 0, rules)).toBe(1);
      expect(computeUploadCost(false, 1, rules)).toBe(1);
      expect(computeUploadCost(false, 5, rules)).toBe(1);
      expect(computeUploadCost(false, 100, rules)).toBe(1);
    });
  });

  describe('Plano PREMIUM (cota mensal por dependente)', () => {
    it('primeiros 6 envios do mês são GRÁTIS', () => {
      // countSoFar 0..5 → countAfter 1..6 → grátis
      for (let i = 0; i < 6; i++) expect(computeUploadCost(true, i, rules)).toBe(0);
    });
    it('do 7º envio em diante cobra premiumCost (5 créditos)', () => {
      // countSoFar 6..N → countAfter 7.. → cobra
      expect(computeUploadCost(true, 6, rules)).toBe(5);
      expect(computeUploadCost(true, 7, rules)).toBe(5);
      expect(computeUploadCost(true, 50, rules)).toBe(5);
    });
    it('limite exato: 6º (countAfter=6) grátis; 7º (countAfter=7) cobra', () => {
      expect(computeUploadCost(true, 5, rules)).toBe(0); // 6º envio
      expect(computeUploadCost(true, 6, rules)).toBe(5); // 7º envio
    });
  });

  describe('Mudança de mês (reset implícito)', () => {
    it('como a rota reseta countSoFar pra 0 no virar do mês, o custo volta a grátis no premium', () => {
      // Simula mês novo: countSoFar resetou → 0 → 1º envio grátis
      expect(computeUploadCost(true, 0, rules)).toBe(0);
    });
  });

  describe('Regras customizadas (admin pode mudar via env)', () => {
    it('respeita regras diferentes', () => {
      const custom = { freeCost: 2, premiumFreeQuota: 3, premiumCost: 10 };
      expect(computeUploadCost(false, 0, custom)).toBe(2);
      expect(computeUploadCost(true, 2, custom)).toBe(0);  // 3º (countAfter=3) grátis
      expect(computeUploadCost(true, 3, custom)).toBe(10); // 4º cobra 10
    });
  });
});
