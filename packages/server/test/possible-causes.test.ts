import { describe, it, expect } from 'vitest';
import { getPossibleCauses, buildCausesContext } from '../src/analysis/possibleCauses';
import { attachPossibleCauses } from '../src/analysis/health-summary';

describe('getPossibleCauses — tabela determinística por canônico', () => {
  it('CK: treino recente declarado → causa benigna primeiro', () => {
    const comTreino = getPossibleCauses('CK', { hasRecentExercise: true })!;
    expect(comTreino[0]).toContain('Treino intenso');
    const semTreino = getPossibleCauses('CK', {})!;
    expect(semTreino[0]).toContain('Atividade física');
  });

  it('CK também casa pela expansão do laboratório ("Creatino quinase")', () => {
    expect(getPossibleCauses('CREATINO QUINASE', {})?.length).toBeGreaterThan(0);
  });

  it('hematócrito alto com hormônio declarado → efeito conhecido da testosterona primeiro', () => {
    const c = getPossibleCauses('HEMATOCRITO', { hasHormone: true, direction: 'high' })!;
    expect(c[0]).toContain('testosterona');
  });

  it('hematócrito alto sem hormônio → desidratação (benigna) primeiro', () => {
    const c = getPossibleCauses('HEMATOCRITO', { direction: 'high' })!;
    expect(c[0]).toContain('Desidratação');
  });

  it('hematócrito BAIXO muda a lista (anemia primeiro) — direção importa', () => {
    const c = getPossibleCauses('HEMATOCRITO', { direction: 'low' })!;
    expect(c[0]).toContain('Anemia');
  });

  it('TGO com treino recente cita liberação muscular pós-treino', () => {
    expect(getPossibleCauses('TGO', { hasRecentExercise: true })![0]).toContain('músculo');
  });

  it('TSH alto vs baixo → hipotireoidismo vs hipertireoidismo', () => {
    expect(getPossibleCauses('TSH', { direction: 'high' })![0]).toContain('Hipotireoidismo');
    expect(getPossibleCauses('TSH', { direction: 'low' })![0]).toContain('Hipertireoidismo');
  });

  it('analito fora da tabela → null (sem card no front)', () => {
    expect(getPossibleCauses('ALBUMINA', {})).toBeNull();
  });

  it('HbA1c NÃO pega a tabela de HEMOGLOBINA (analito distinto)', () => {
    expect(getPossibleCauses('HEMOGLOBINA GLICADA', {})).toBeNull();
  });

  it('cobertura: tabela cobre ≥15 analitos comuns, todos com 1-3 causas não vazias', () => {
    const common = ['LDL', 'COLESTEROL TOTAL', 'HDL', 'TRIGLICERIDES', 'GLICEMIA', 'HEMOGLOBINA', 'TSH',
      'VITAMINA D', 'B12', 'ACIDO URICO', 'CREATININA', 'PCR', 'FERRITINA', 'POTASSIO', 'UREIA', 'GGT', 'TGP'];
    const hit = common.filter((a) => {
      const c = getPossibleCauses(a, {});
      return !!c && c.length >= 1 && c.length <= 3 && c.every((s) => s.length > 5);
    });
    expect(hit.length).toBeGreaterThanOrEqual(15);
  });
});

describe('buildCausesContext — contexto declarado pelo paciente', () => {
  it('treino24h no collectionContext (perfil ativo) → hasRecentExercise', () => {
    const ctx = buildCausesContext({ sportsProfile: { active: true, collectionContext: { treino24h: true } } });
    expect(ctx.hasRecentExercise).toBe(true);
  });

  it('perfil esportivo INATIVO ignora treino declarado (toggle do paciente no servidor)', () => {
    const ctx = buildCausesContext({ sportsProfile: { active: false, collectionContext: { treino24h: true } } });
    expect(ctx.hasRecentExercise).toBe(false);
  });

  it('testosterona (medicação com prefixo de classe) → hasHormone', () => {
    const ctx = buildCausesContext({ medications: ['[Hormônio] Testosterona'] });
    expect(ctx.hasHormone).toBe(true);
  });

  it('perfil clínico mencionando testosterona também conta; sem menção → false', () => {
    expect(buildCausesContext({ clinicalProfile: 'uso testosterona 200mg' }).hasHormone).toBe(true);
    expect(buildCausesContext({ clinicalProfile: 'hipertensão' }).hasHormone).toBe(false);
  });
});

describe('attachPossibleCauses — anexa ao comparativo do resumo', () => {
  const items = [
    { name: 'LDL Colesterol', nameCanonical: 'LDL', valueNumeric: 160, refLow: 0, refHigh: 130, flag: 'HIGH', isAbnormal: true },
    { name: 'TSH', nameCanonical: 'TSH', valueNumeric: 2.0, refLow: 0.4, refHigh: 4.0, flag: 'NORMAL', isAbnormal: false },
  ];

  it('linha alterada ganha possibleCauses; linha normal não ganha', () => {
    const out = attachPossibleCauses(
      { comparativo: [{ name: 'LDL Colesterol' }, { name: 'TSH' }] } as any,
      items,
      {},
    );
    expect(out.comparativo[0].possibleCauses?.length).toBeGreaterThan(0);
    expect(out.comparativo[0].possibleCauses?.[0]).toContain('Dieta');
    expect(out.comparativo[1].possibleCauses).toBeUndefined();
  });

  it('casa pelo nome de exibição que a IA escreveu ("LDL colesterol calculado")', () => {
    const out = attachPossibleCauses({ comparativo: [{ name: 'Colesterol LDL' }] } as any, items, {});
    expect(out.comparativo[0].possibleCauses).toBeDefined();
  });

  it('flag LOW do item define direção low (lista de baixo)', () => {
    const out = attachPossibleCauses(
      { comparativo: [{ name: 'Hemoglobina' }] } as any,
      [{ name: 'Hemoglobina', nameCanonical: 'HEMOGLOBINA', valueNumeric: 10.9, refLow: 13, refHigh: 17, flag: 'LOW', isAbnormal: true }],
      {},
    );
    expect(out.comparativo[0].possibleCauses?.[0]).toContain('ferro');
  });

  it('sem itens alterados ou comparativo vazio → resumo intacto', () => {
    const s = { comparativo: [{ name: 'TSH' }] } as any;
    expect(attachPossibleCauses(s, items.filter((i) => !i.isAbnormal), {})).toBe(s);
    expect(attachPossibleCauses({ comparativo: [] } as any, items, {})).toEqual({ comparativo: [] });
  });
});
