import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { FOOD_GUIDES, directionOf, findFoodGuide, foodHintFor, matchFoodGuides } from '../src/analysis/food-guide';

describe('dicionário de alimentação: conteúdo', () => {
  const allText = (g: (typeof FOOD_GUIDES)[number]) => [g.summary, g.dietAlone, g.hint ?? '', ...g.helps, ...g.avoid].join(' \n ');

  it('toda entrada tem fonte, resumo e resposta para "só a alimentação resolve?"', () => {
    for (const g of FOOD_GUIDES) {
      expect(g.source.length, g.key).toBeGreaterThan(20);
      expect(g.summary.length, g.key).toBeGreaterThan(20);
      expect(g.dietAlone.length, g.key).toBeGreaterThan(10);
    }
    expect(new Set(FOOD_GUIDES.map((g) => g.key)).size).toBe(FOOD_GUIDES.length);
  });

  it('nenhum texto traz número, quantidade, porção ou promessa de resultado', () => {
    for (const g of FOOD_GUIDES) {
      const text = allText(g);
      expect(text, g.key).not.toMatch(/\d/); // nem percentual, nem gramas, nem "3 xícaras"
      expect(text, g.key).not.toMatch(/\b(mg|gramas?|ml|porç(ão|ões) de|xícaras?|colher(es)? de|cápsulas?|dose)\b/i);
      expect(text, g.key).not.toMatch(/\b(cura|garant|elimina|normaliza em|resolve em)\w*/i);
    }
  });

  it('quando a dieta não resolve, não lista alimento que "ajuda" nem vira dica de push', () => {
    const none = FOOD_GUIDES.filter((g) => g.strength === 'nao-resolve');
    expect(none.length).toBeGreaterThanOrEqual(5);
    for (const g of none) {
      expect(g.helps, g.key).toEqual([]);
      expect(g.hint, g.key).toBeUndefined();
      expect(g.dietAlone, g.key).toMatch(/^Não\./);
    }
  });

  it('evidência limitada nunca vira dica de push', () => {
    for (const g of FOOD_GUIDES.filter((x) => x.strength === 'limitada')) expect(g.hint, g.key).toBeUndefined();
  });
});

describe('dicionário de alimentação: cruzamento', () => {
  it('lado da alteração vem da faixa do laudo', () => {
    expect(directionOf({ value: 160, refLow: null, refHigh: 130 })).toBe('alto');
    expect(directionOf({ value: 20, refLow: 30, refHigh: 300 })).toBe('baixo');
    expect(directionOf({ value: 100, refLow: 70, refHigh: 130 })).toBeNull();
    expect(directionOf({ value: 100, refLow: null, refHigh: null })).toBeNull();
    expect(directionOf({ value: 100, refLow: null, refHigh: null, flag: 'HIGH' })).toBe('alto');
    expect(directionOf({ value: null, refLow: 1, refHigh: 2 })).toBeNull();
  });

  it('acha a orientação certa e não confunde exames parecidos', () => {
    expect(findFoodGuide('COLESTEROL LDL', 'alto')?.key).toBe('ldl');
    expect(findFoodGuide('COLESTEROL VLDL', 'alto')).toBeNull();
    expect(findFoodGuide('COLESTEROL HDL', 'baixo')?.key).toBe('hdl');
    expect(findFoodGuide('COLESTEROL HDL', 'alto')).toBeNull(); // HDL alto não é problema de dieta
    expect(findFoodGuide('COLESTEROL NAO-HDL', 'baixo')).toBeNull();
    expect(findFoodGuide('TRIGLICERÍDEOS', 'alto')?.key).toBe('triglicerideos');
    expect(findFoodGuide('HEMOGLOBINA GLICADA', 'alto')?.key).toBe('hba1c');
    expect(findFoodGuide('HEMOGLOBINA', 'baixo')?.key).toBe('anemia');
    expect(findFoodGuide('HEMOGLOBINA GLICADA', 'baixo')).toBeNull();
    expect(findFoodGuide('FERRITINA', 'baixo')?.key).toBe('ferro-baixo');
    expect(findFoodGuide('FERRITINA', 'alto')?.key).toBe('ferritina-alta');
    expect(findFoodGuide('TSH', 'alto')?.key).toBe('tsh');
    expect(findFoodGuide('TSH', 'baixo')?.key).toBe('tsh');
    expect(findFoodGuide('GLICOSE URINARIA', 'alto')).toBeNull();
    expect(findFoodGuide('VITAMINA D', 'baixo')).toBeNull(); // fora do dicionário: sem fonte conferida
  });

  it('só exame fora da faixa entra, uma vez cada, com evidência forte primeiro', () => {
    const out = matchFoodGuides([
      { nameCanonical: 'TSH', value: 9, unit: 'mUI/L', refLow: 0.4, refHigh: 4, date: '2026-10-01' },
      { nameCanonical: 'COLESTEROL LDL', value: 162, unit: 'mg/dL', refLow: null, refHigh: 130, date: '2026-10-01' },
      { nameCanonical: 'LDL COLESTEROL', value: 170, unit: 'mg/dL', refLow: null, refHigh: 130, date: '2026-10-01' },
      { nameCanonical: 'GLICOSE', value: 90, unit: 'mg/dL', refLow: 70, refHigh: 99, date: '2026-10-01' },
      { nameCanonical: 'ACIDO URICO', value: 8.1, unit: 'mg/dL', refLow: 3.4, refHigh: 7, date: '2026-10-01' },
    ]);
    expect(out.map((m) => m.guide.key)).toEqual(['ldl', 'acido-urico', 'tsh']);
    expect(out[0].guide).not.toHaveProperty('match');
    expect(out[0].direction).toBe('alto');
  });

  it('dica de push só existe para evidência forte ou moderada', () => {
    expect(foodHintFor('TRIGLICERIDEOS', 'alto')).toContain('bebida adoçada');
    expect(foodHintFor('ACIDO URICO', 'alto')).toBeNull();
    expect(foodHintFor('TSH', 'alto')).toBeNull();
    expect(foodHintFor('COLESTEROL LDL', 'baixo')).toBeNull();
    expect(foodHintFor('COLESTEROL LDL', null)).toBeNull();
  });
});

describe('GET /api/items/food-guide', () => {
  beforeEach(async () => { await resetDb(); });

  it('exige login', async () => {
    expect((await api().get('/api/items/food-guide')).status).toBe(401);
  });

  it('cruza o resultado mais recente de cada exame e devolve o dicionário', async () => {
    const { token, patient } = await createUser();
    const mk = async (performedAt: string, items: Array<[string, number, number | null, number | null]>) => {
      const exam = await prisma.exam.create({ data: { patientId: patient.id, title: 'Exame', status: 'EXTRACTED', performedAt: new Date(performedAt), sourceLab: 'Lab Teste', filePath: '/test/' + performedAt + '.pdf', fileSha256: 'sha-' + performedAt } as never });
      for (const [name, value, refLow, refHigh] of items) {
        await prisma.examItem.create({ data: { examId: exam.id, name, nameCanonical: name, valueNumeric: value, unit: 'mg/dL', refLow, refHigh, extractedPage: 1 } as never });
      }
    };
    await mk('2026-05-01T12:00:00Z', [['TRIGLICERIDEOS', 310, null, 150], ['COLESTEROL LDL', 120, null, 130]]);
    await mk('2026-10-01T12:00:00Z', [['TRIGLICERIDEOS', 140, null, 150], ['COLESTEROL LDL', 165, null, 130]]);

    const r = await api().get('/api/items/food-guide').set(authHeader(token));
    expect(r.status).toBe(200);
    // triglicerídeos voltou para a faixa no exame mais novo; LDL saiu
    expect(r.body.matches.map((m: { guide: { key: string } }) => m.guide.key)).toEqual(['ldl']);
    expect(r.body.matches[0].value).toBe(165);
    expect(r.body.dictionary.length).toBe(FOOD_GUIDES.length);
    expect(JSON.stringify(r.body)).not.toContain('"match"');
    expect(r.body.examsRead).toBe(2);
  });

  it('um usuário não vê os exames de outro', async () => {
    const owner = await createUser();
    const other = await createUser();
    const exam = await prisma.exam.create({ data: { patientId: owner.patient.id, title: 'Exame', status: 'EXTRACTED', performedAt: new Date(), sourceLab: 'Lab Teste', filePath: '/test/outro.pdf', fileSha256: 'sha-outro' } as never });
    await prisma.examItem.create({ data: { examId: exam.id, name: 'COLESTEROL LDL', nameCanonical: 'COLESTEROL LDL', valueNumeric: 190, refHigh: 130, extractedPage: 1 } as never });
    const r = await api().get(`/api/items/food-guide?patientId=${owner.patient.id}`).set(authHeader(other.token));
    expect(r.status).toBe(200);
    expect(r.body.matches).toEqual([]);
  });
});
