import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam, createItem } from './helpers';

const D1 = new Date('2026-01-15T00:00:00Z');
const D2 = new Date('2026-03-20T00:00:00Z');

describe('itens: flags, alterados, série temporal, evolução', () => {
  beforeEach(async () => { await resetDb(); });

  it('GET /items/flag-summary classifica em bons/alerta/alterados', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id);
    await createItem(exam.id, { name: 'A', nameCanonical: 'A', valueNumeric: 14, refLow: 12, refHigh: 16, flag: 'NORMAL', isAbnormal: false });
    await createItem(exam.id, { name: 'B', nameCanonical: 'B', valueNumeric: 14, refLow: 12, refHigh: 16, flag: 'NORMAL', isAbnormal: false });
    await createItem(exam.id, { name: 'C', nameCanonical: 'C', valueNumeric: 20, refLow: 12, refHigh: 16, flag: 'HIGH', isAbnormal: true });
    await createItem(exam.id, { name: 'D', nameCanonical: 'D', valueNumeric: 10, refLow: 12, refHigh: 16, flag: 'LOW', isAbnormal: true });

    const r = await api().get('/api/items/flag-summary').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.buckets).toEqual({ bons: 2, alerta: 1, alterados: 1 });
  });

  it('GET /items/abnormal lista só os fora-da-faixa', async () => {
    const { patient, token } = await createUser();
    const exam = await createExam(patient.id);
    await createItem(exam.id, { name: 'NORMAL_OK', nameCanonical: 'X', valueNumeric: 14, refLow: 12, refHigh: 16 });
    await createItem(exam.id, { name: 'ALTO', nameCanonical: 'Y', valueNumeric: 20, refLow: 12, refHigh: 16, flag: 'HIGH', isAbnormal: true });
    await createItem(exam.id, { name: 'BAIXO', nameCanonical: 'Z', valueNumeric: 10, refLow: 12, refHigh: 16, flag: 'LOW', isAbnormal: true });

    const r = await api().get('/api/items/abnormal').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.items.map((i: any) => i.name).sort()).toEqual(['ALTO', 'BAIXO']);
  });

  it('GET /items/timeseries devolve os pontos do analito ao longo do tempo', async () => {
    const { patient, token } = await createUser();
    const e1 = await createExam(patient.id, { title: 'Jan', performedAt: D1 });
    const e2 = await createExam(patient.id, { title: 'Mar', performedAt: D2 });
    await createItem(e1.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 13, refLow: 12, refHigh: 16 });
    await createItem(e2.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 17, refLow: 12, refHigh: 16 });

    const r = await api().get('/api/items/timeseries').set(authHeader(token)).query({ nameCanonical: 'HEMOGLOBINA' });
    expect(r.status).toBe(200);
    expect(r.body.points).toHaveLength(2);
    expect(r.body.points.map((p: any) => p.valueNumeric)).toEqual([13, 17]);
  });

  it('GET /items/timeseries sem nameCanonical → 400', async () => {
    const { token } = await createUser();
    const r = await api().get('/api/items/timeseries').set(authHeader(token));
    expect(r.status).toBe(400);
  });

  it('GET /items/evolution inclui analito com ≥2 pontos e calcula variação', async () => {
    const { patient, token } = await createUser();
    const e1 = await createExam(patient.id, { title: 'Jan', performedAt: D1 });
    const e2 = await createExam(patient.id, { title: 'Mar', performedAt: D2 });
    await createItem(e1.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 13, refLow: 12, refHigh: 16 });
    await createItem(e2.id, { name: 'HEMOGLOBINA', nameCanonical: 'HEMOGLOBINA', valueNumeric: 17, refLow: 12, refHigh: 16 });
    // analito com 1 ponto só → NÃO entra na evolução
    await createItem(e2.id, { name: 'GLICEMIA', nameCanonical: 'GLICEMIA', valueNumeric: 90, refLow: 70, refHigh: 99 });

    const r = await api().get('/api/items/evolution').set(authHeader(token));
    expect(r.status).toBe(200);
    const hemo = r.body.items.find((i: any) => i.nameCanonical === 'HEMOGLOBINA');
    expect(hemo).toBeTruthy();
    expect(hemo.firstValue).toBe(13);
    expect(hemo.lastValue).toBe(17);
    expect(r.body.items.find((i: any) => i.nameCanonical === 'GLICEMIA')).toBeUndefined();
  });
});
