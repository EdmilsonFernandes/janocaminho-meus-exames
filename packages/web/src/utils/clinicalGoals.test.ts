// E2.4/E2.5 — lógica PURA das metas clínicas (camada 2) e da não-comparação por método.
// REGRA INEGOCIÁVEL (§4): a meta é INFORMATIVA — nenhuma função aqui lê ou escreve
// isAbnormal/flag/alertas; o duplo-estado textual SEMPRE preserva a régua do laboratório.
import { describe, it, expect } from 'vitest';
import { goalFor, withinGoal, withinRef, dualStatusText, goalRangeText, hasMixedMethods, lineBreakFlags } from './clinicalGoals';
import type { ClinicalGoalView } from '@meus-exames/shared';

const goal = (over: Partial<ClinicalGoalView> = {}): ClinicalGoalView => ({
  id: 'g1', patientId: 'p1', analyte: 'HEMOGLOBINA', unit: 'g/dL',
  targetLow: 18, targetHigh: 20,
  setBy: 'Dr. Teste (CRM 11111-SP)',
  justification: 'Alvo terapêutico individual.', source: null,
  validFrom: '2026-10-01T00:00:00.000Z',
  ...over,
});

describe('goalFor', () => {
  it('acha por analyte (case-insensitive) e respeita patientId; null quando vazio', () => {
    const goals = [goal(), goal({ id: 'g2', patientId: 'p2', analyte: 'TESTOSTERONA_TOTAL' })];
    expect(goalFor(goals, 'hemoglobina', 'p1')?.id).toBe('g1');
    expect(goalFor(goals, 'HEMOGLOBINA', 'p2')).toBeNull(); // meta de outro paciente
    expect(goalFor(goals, 'TSH')).toBeNull();
    expect(goalFor(null, 'TSH')).toBeNull();
  });
});

describe('withinGoal / withinRef', () => {
  it('limites null = sem piso/teto; valor não-numérico → null', () => {
    expect(withinGoal(19, goal())).toBe(true);
    expect(withinGoal(21, goal())).toBe(false);
    expect(withinGoal(17.9, goal())).toBe(false);
    expect(withinGoal(19, goal({ targetLow: null }))).toBe(true);   // só teto
    expect(withinGoal(25, goal({ targetLow: null }))).toBe(false);
    expect(withinGoal(null, goal())).toBeNull();
    expect(withinGoal(19, null)).toBeNull();
    expect(withinRef(15, 13, 17)).toBe(true);
    expect(withinRef(19, 13, 17)).toBe(false);
    expect(withinRef(15, 13, null)).toBe(true);
    expect(withinRef(15, null, null)).toBeNull();
  });
});

describe('dualStatusText — REGRA DURA: meta nunca mascara a régua do lab', () => {
  it('dentro da meta e FORA da referência → os DOIS fatos explícitos', () => {
    expect(dualStatusText(true, false)).toBe('Atinge a meta clínica; permanece fora da referência do laboratório.');
  });
  it('dentro da referência e fora da meta → vice-versa explícito', () => {
    expect(dualStatusText(false, true)).toBe('Está dentro da referência do laboratório, mas fora da meta clínica definida pelo médico.');
  });
  it('fora dos dois; dentro dos dois; sem dados → null', () => {
    expect(dualStatusText(false, false)).toContain('Fora da meta clínica');
    expect(dualStatusText(true, true)).toContain('Dentro da meta clínica');
    expect(dualStatusText(null, null)).toBeNull();
  });
});

describe('goalRangeText', () => {
  it('formata faixa, piso e teto em pt-BR', () => {
    expect(goalRangeText(goal())).toBe('18 – 20 g/dL');
    expect(goalRangeText(goal({ targetHigh: null }))).toBe('≥ 18 g/dL');
    expect(goalRangeText(goal({ targetLow: null }))).toBe('≤ 20 g/dL');
    expect(goalRangeText(goal({ targetLow: null, targetHigh: null, unit: null }))).toBe('—');
  });
});

describe('E2.5 — métodos diferentes não comparam', () => {
  it('hasMixedMethods: ≥2 métodos informados distintos OU informado × não-informado', () => {
    expect(hasMixedMethods([{ method: 'Química seca' }, { method: 'química seca' }])).toBe(false); // mesmo método (case)
    expect(hasMixedMethods([{ method: null }, { method: null }])).toBe(false); // nenhum informado → compara (comportamento atual)
    expect(hasMixedMethods([{ method: 'Química seca' }, { method: 'Eletroquimioluminescência' }])).toBe(true);
    expect(hasMixedMethods([{ method: null }, { method: 'ECL' }])).toBe(true); // não dá p/ afirmar mesmo ensaio
    expect(hasMixedMethods([{ method: 'Química seca' }, { method: null }, { method: null }])).toBe(true);
  });

  it('lineBreakFlags: quebra a linha onde o método muda (incl. informado × não-informado)', () => {
    const pts = [{ method: 'A' }, { method: 'A' }, { method: 'B' }, { method: null }, { method: 'B' }];
    expect(lineBreakFlags(pts)).toEqual([false, false, true, true, true]);
    // todos iguais → linha contínua
    expect(lineBreakFlags([{ method: 'A' }, { method: 'a' }, { method: 'A ' }])).toEqual([false, false, false]);
  });
});
