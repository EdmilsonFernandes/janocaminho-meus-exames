// E2.5 — coluna `method` (método do ensaio) em ExamItem: extração aceita best effort
// (schema zod preserva o campo) e os endpoints de série/evolução devolvem `method` por
// ponto (o front usa p/ chip "⚠️ Métodos diferentes" + pontos isolados — nunca compara
// ensaios distintos). A coluna é metadado: NUNCA altera valor/flag/isAbnormal.
import { describe, it, expect, beforeEach } from 'vitest';
import { api, authHeader, resetDb, createUser, createExam } from './helpers';
import { prisma } from '../src/prisma';
import { ExtractionItemSchema } from '../src/extraction/schemas';

const item = (examId: string, opts: { valueNumeric: number; method?: string | null; performedAt?: Date; sha?: string }) =>
  prisma.examItem.create({
    data: {
      examId,
      name: 'TESTOSTERONA', nameCanonical: 'TESTOSTERONA_TOTAL',
      valueNumeric: opts.valueNumeric, valueText: String(opts.valueNumeric), unit: 'ng/dL',
      refLow: 300, refHigh: 900, refText: '300-900',
      flag: 'NORMAL', isAbnormal: false, extractedPage: 1,
      method: opts.method ?? null,
    },
    select: { id: true, method: true },
  });

describe('exam-item-method (E2.5)', () => {
  beforeEach(async () => { await resetDb(); });

  it('schema da extração aceita e PRESERVA method (best effort, nunca obrigatório)', () => {
    const withMethod = ExtractionItemSchema.parse({ name: 'VITAMINA D', valueNumeric: 32, unit: 'ng/mL', page: 1, method: 'Química seca' });
    expect(withMethod.method).toBe('Química seca');
    const semMethod = ExtractionItemSchema.parse({ name: 'VITAMINA D', valueNumeric: 32, unit: 'ng/mL', page: 1 });
    expect(semMethod.method).toBeUndefined(); // laudo sem método → null no pipeline
    expect(ExtractionItemSchema.safeParse({ name: 'X', page: 1, method: 123 }).success).toBe(false); // method é string
  });

  it('timeseries e evolution devolvem method por ponto (null quando não informado)', async () => {
    const { token, patient } = await createUser();
    const e1 = await createExam(patient.id, { performedAt: new Date('2026-08-01T00:00:00Z') });
    const e2 = await createExam(patient.id, { performedAt: new Date('2026-09-01T00:00:00Z') });
    await item(e1.id, { valueNumeric: 380, method: 'Química seca' });
    await item(e2.id, { valueNumeric: 520, method: 'Eletroquimioluminescência' });

    const ts = await api().get('/api/items/timeseries?nameCanonical=TESTOSTERONA_TOTAL').set(authHeader(token));
    expect(ts.status).toBe(200);
    expect(ts.body.points).toHaveLength(2);
    expect(ts.body.points.map((p: any) => p.method)).toEqual(['Química seca', 'Eletroquimioluminescência']);

    const evo = await api().get('/api/items/evolution').set(authHeader(token));
    const row = evo.body.items.find((i: any) => i.nameCanonical === 'TESTOSTERONA_TOTAL');
    expect(row.points.map((p: any) => p.method)).toEqual(['Química seca', 'Eletroquimioluminescência']);
    // metadado não vira sinalização: flags seguem como estavam
    expect(row.abnormal).toBe(false);
  });

  it('itens legados sem method → pontos com method null (comparação segue como hoje)', async () => {
    const { token, patient } = await createUser();
    const e1 = await createExam(patient.id, { performedAt: new Date('2026-08-01T00:00:00Z') });
    const e2 = await createExam(patient.id, { performedAt: new Date('2026-09-01T00:00:00Z') });
    await item(e1.id, { valueNumeric: 380 });
    await item(e2.id, { valueNumeric: 520 });
    const ts = await api().get('/api/items/timeseries?nameCanonical=TESTOSTERONA_TOTAL').set(authHeader(token));
    expect(ts.body.points.map((p: any) => p.method)).toEqual([null, null]);
  });
});
