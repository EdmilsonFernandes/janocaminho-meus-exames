import { describe, it, expect } from 'vitest';
import {
  ageInDays, formatAgePt, valueForZ, zFromLms, percentileForZ, getLms, zForValue, buildChartGrid,
} from './growth';
import type { LmsRow } from '@pedi-growth/core';

// Utilitário: linha LMS sintética p/ identidades matemáticas (independe da tabela real).
const row = (L: number, M: number, S: number): LmsRow => ({ age: 0, L, M, S });

describe('ageInDays / formatAgePt', () => {
  it('datas conhecidas (UTC, imune a fuso)', () => {
    expect(ageInDays('2024-01-01', '2024-01-01')).toBe(0);
    expect(ageInDays('2024-01-01', '2024-02-01')).toBe(31);
    expect(ageInDays('2024-03-01', '2024-03-01')).toBe(0);
    expect(ageInDays('2024-02-28', '2024-03-01')).toBe(2); // 2024 bissexto
  });
  it('formato legível pt-BR', () => {
    expect(formatAgePt(0)).toBe('0d');
    expect(formatAgePt(27)).toBe('27d');
    expect(formatAgePt(244)).toBe('8m'); // ~8 meses
    expect(formatAgePt(756)).toBe('2a 0m'); // 24,8 meses
    expect(formatAgePt(871)).toBe('2a 4m'); // ~28,6 meses
    expect(formatAgePt(-5)).toBe('—');
  });
});

describe('LMS: z e valor são inversos', () => {
  it('valueForZ com L≠0 (cálculo manual)', () => {
    // v = M·(1+L·S·z)^(1/L) = 10·(1+1·0.1·2)^1 = 12
    expect(valueForZ(row(1, 10, 0.1), 2)).toBeCloseTo(12, 6);
    expect(valueForZ(row(1, 10, 0.1), 0)).toBeCloseTo(10, 6); // z=0 → mediana
  });
  it('valueForZ com L≈0 (logarítmico)', () => {
    expect(valueForZ(row(0, 10, 0.1), 1)).toBeCloseTo(10 * Math.exp(0.1), 6);
  });
  it('roundtrip na tabela REAL: z → valor → z (idêntico, engine exata)', async () => {
    for (const [ind, days] of [['wfa', 730], ['lhfa', 730], ['bfa', 1461]] as const) {
      const lms = await getLms(ind, 'male', days);
      expect(lms, `${ind} @${days}d`).not.toBeNull();
      for (const z of [-1.881, -1.036, 0, 1.036, 1.881]) {
        const v = valueForZ(lms!, z);
        expect(zFromLms(lms!, v), `${ind} z=${z}`).toBeCloseTo(z, 6);
      }
    }
  });
});

describe('percentil via CDF normal (A&S 26.2.17)', () => {
  it('marcos conhecidos', () => {
    expect(percentileForZ(0)).toBeCloseTo(50, 3);
    expect(percentileForZ(1.881)).toBeCloseTo(97, 1); // z do percentil 97
    expect(percentileForZ(-1.881)).toBeCloseTo(3, 1);
    expect(percentileForZ(1.0364)).toBeCloseTo(85, 1);
  });
});

describe('tabelas OMS — estrutura e cobertura', () => {
  it('unidades certas por indicador no nascimento (menino) — guarda contra tabela errada', async () => {
    const w = await getLms('wfa', 'male', 0);
    expect(w!.M).toBeGreaterThan(3.0); // kg
    expect(w!.M).toBeLessThan(4.0);
    const h = await getLms('lhfa', 'male', 0);
    expect(h!.M).toBeGreaterThan(45); // cm
    expect(h!.M).toBeLessThan(55);
    const b = await getLms('bfa', 'male', 0);
    expect(b!.M).toBeGreaterThan(11); // kg/m²
    expect(b!.M).toBeLessThan(14);
  });
  it('mediana peso-para-idade menino @24m ≈ 12 kg (12,0–12,4)', async () => {
    const lms = await getLms('wfa', 'male', 730);
    expect(lms!.M).toBeGreaterThan(12.0);
    expect(lms!.M).toBeLessThan(12.4);
  });
  it('menina @24m tem mediana DISTINTA do menino (tabelas separadas)', async () => {
    const boys = (await getLms('wfa', 'male', 730))!.M;
    const girls = (await getLms('wfa', 'female', 730))!.M;
    expect(Math.abs(boys - girls)).toBeGreaterThan(0.3);
  });
  it('transição 0-5 → 5-19 contínua (sem salto na mediana de IMC)', async () => {
    const before = await getLms('bfa', 'male', 1856);
    const after = await getLms('bfa', 'male', 1862); // ~61 meses
    expect(Math.abs(after!.M - before!.M)).toBeLessThan(0.4);
  });
  it('peso-para-idade ACABA nos 10 anos (OMS não publica acima) — null', async () => {
    expect(await getLms('wfa', 'male', 12 * 365.25)).toBeNull();
    expect(await getLms('wfa', 'male', 9 * 365.25)).not.toBeNull();
  });
  it('altura e IMC cobrem até ~19 anos; acima, null', async () => {
    expect(await getLms('lhfa', 'female', 12 * 365.25)).not.toBeNull();
    expect(await getLms('bfa', 'female', 18 * 365.25)).not.toBeNull();
    expect(await getLms('lhfa', 'female', 20 * 365.25)).toBeNull();
    expect(await getLms('bfa', 'female', 20 * 365.25)).toBeNull();
  });
});

describe('zForValue — valores plausíveis', () => {
  it('menino 24m com 12 kg fica perto da mediana (|z| < 0.5)', async () => {
    const r = await zForValue('wfa', 'male', 730, 12.0);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.z)).toBeLessThan(0.5);
    expect(r!.percentile).toBeGreaterThan(25);
    expect(r!.percentile).toBeLessThan(75);
  });
  it('idade fora da tabela → null', async () => {
    expect(await zForValue('wfa', 'male', 12 * 365.25, 40)).toBeNull();
  });
});

describe('buildChartGrid', () => {
  it('grade monotônica com todos os percentis + mês extra da criança', async () => {
    const grid = await buildChartGrid('lhfa', 'female', 0, 24 * 30.4375, [18.63]);
    expect(grid.length).toBeGreaterThan(20);
    const ms = grid.map((g) => g.m);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms); // ordenada
    expect(ms).toContain(18.63); // ponto do paciente entrou na grade
    for (const g of grid) {
      expect(g.p3!).toBeLessThan(g.p50!);
      expect(g.p50!).toBeLessThan(g.p97!);
    }
  });
  it('peso acima de 10a: grade vazia (curva não existe)', async () => {
    const grid = await buildChartGrid('wfa', 'male', 11 * 365.25, 12 * 365.25);
    expect(grid).toEqual([]);
  });
});
