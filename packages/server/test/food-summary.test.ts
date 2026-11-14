import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, authHeader, createUser, resetDb } from './helpers';
import { prisma } from '../src/prisma';
import { foodSummaryProblems } from '../src/analysis/food-summary';

const llm = vi.hoisted(() => ({ replies: [] as string[], calls: 0, fail: false }));
vi.mock('../src/llm', () => ({
  getLlm: () => ({ stream: async () => { if (llm.fail) throw new Error('fora do ar'); return { final: async () => ({ text: llm.replies[Math.min(llm.calls++, llm.replies.length - 1)] ?? '' }) }; } }),
  getModel: () => 'test-model',
}));

const GOOD = {
  resumo: 'Seu LDL está acima da faixa do laudo, e esse é um exame que responde bem à alimentação. Trocar gordura saturada por azeite, castanhas e peixe e comer mais aveia e feijão são as mudanças com mais evidência. Os resultados aparecem no exame seguinte.',
  comecarPor: ['Trocar manteiga e carne gorda por azeite e peixe.', 'Colocar aveia e feijão no dia a dia.'],
  levarAoMedico: 'Se o LDL continuar acima da faixa, o médico avalia se precisa de remédio junto com a alimentação.',
};

async function withLdlHigh() {
  const u = await createUser({ credits: 20 });
  const exam = await prisma.exam.create({ data: { patientId: u.patient.id, title: 'Exame', status: 'EXTRACTED', performedAt: new Date('2026-10-01T12:00:00Z'), sourceLab: 'Lab Teste', filePath: '/test/a.pdf', fileSha256: `sha-${Date.now()}-${Math.random()}` } as never });
  await prisma.examItem.create({ data: { examId: exam.id, name: 'COLESTEROL LDL', nameCanonical: 'COLESTEROL LDL', valueNumeric: 165, unit: 'mg/dL', refHigh: 130, extractedPage: 1 } as never });
  return u;
}
const credits = async (id: string) => (await prisma.user.findUnique({ where: { id }, select: { credits: true } }))!.credits;

describe('travas do resumo de alimentação', () => {
  it('texto bom passa', () => expect(foodSummaryProblems(GOOD)).toEqual([]));

  it.each([
    ['quantidade', { comecarPor: ['Coma 30 g de aveia por dia.'] }, 'cita quantidade'],
    ['porção', { comecarPor: ['Duas colheres de azeite no almoço.'] }, 'cita porção ou dose'],
    ['cardápio', { resumo: `${GOOD.resumo} Segue um cardápio para a semana.` }, 'monta dieta'],
    ['promessa', { resumo: `${GOOD.resumo} Isso garante o colesterol normal.` }, 'promete resultado'],
    ['suplemento', { comecarPor: ['Tomar ômega em cápsula ajuda.'] }, 'cita porção ou dose'],
    ['medicação', { levarAoMedico: 'Com essas mudanças, reduza o remédio aos poucos e veja como fica.' }, 'orienta medicação'],
  ])('reprova %s', (_n, patch, problem) => {
    expect(foodSummaryProblems({ ...GOOD, ...patch })).toContain(problem);
  });

  it('reprova lista vazia ou grande demais', () => {
    expect(foodSummaryProblems({ ...GOOD, comecarPor: [] })).toContain('lista "começar por" inválida');
    expect(foodSummaryProblems({ ...GOOD, comecarPor: ['a', 'b', 'c', 'd'] })).toContain('lista "começar por" inválida');
    expect(foodSummaryProblems(null)).toEqual(['sem conteúdo']);
  });
});

/** A geração roda em segundo plano: espera a tela (GET) mostrar o resumo ou o erro. */
async function waitDone(token: string) {
  for (let i = 0; i < 60; i++) {
    const page = await api().get('/api/items/food-guide').set(authHeader(token));
    if (page.body.summary || page.body.summaryStatus === 'error') return page.body;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('a geração não terminou');
}

describe('POST /api/items/food-guide/summary', () => {
  beforeEach(async () => { await resetDb(); llm.replies = [JSON.stringify(GOOD)]; llm.calls = 0; llm.fail = false; });

  it('responde na hora, gera em segundo plano, cobra uma vez e depois devolve do cache', async () => {
    const u = await withLdlHigh();
    const first = await api().post('/api/items/food-guide/summary').set(authHeader(u.token)).send({});
    expect(first.status).toBe(202);
    expect(first.body).toEqual({ status: 'pending', charged: 5 });

    const page = await waitDone(u.token);
    expect(page.summary.content.resumo).toBe(GOOD.resumo);
    expect(page.summary.content.comecarPor).toHaveLength(2);
    expect(page.summaryStatus).toBeNull();
    expect(page.summaryCost).toBe(5);
    expect(page.matches[0].points).toHaveLength(1);
    expect(await credits(u.user.id)).toBe(15);

    const again = await api().post('/api/items/food-guide/summary').set(authHeader(u.token)).send({});
    expect(again.status).toBe(200);
    expect(again.body.cached).toBe(true);
    expect(again.body.charged).toBe(0);
    expect(llm.calls).toBe(1);
    expect(await credits(u.user.id)).toBe(15);
  });

  it('exame novo muda a assinatura: o resumo antigo deixa de valer', async () => {
    const u = await withLdlHigh();
    await api().post('/api/items/food-guide/summary').set(authHeader(u.token)).send({});
    await waitDone(u.token);
    const exam = await prisma.exam.create({ data: { patientId: u.patient.id, title: 'Exame 2', status: 'EXTRACTED', performedAt: new Date('2026-11-01T12:00:00Z'), sourceLab: 'Lab Teste', filePath: '/test/b.pdf', fileSha256: `sha-b-${Date.now()}` } as never });
    await prisma.examItem.create({ data: { examId: exam.id, name: 'COLESTEROL LDL', nameCanonical: 'COLESTEROL LDL', valueNumeric: 150, unit: 'mg/dL', refHigh: 130, extractedPage: 1 } as never });
    const page = await api().get('/api/items/food-guide').set(authHeader(u.token));
    expect(page.body.summary).toBeNull();
    expect(page.body.matches[0].points).toHaveLength(2);
  });

  it('texto reprovado pelas travas: erro na tela, nada salvo e crédito devolvido', async () => {
    const u = await withLdlHigh();
    llm.replies = [JSON.stringify({ ...GOOD, comecarPor: ['Coma 30 g de aveia por dia.'] })];
    const r = await api().post('/api/items/food-guide/summary').set(authHeader(u.token)).send({});
    expect(r.status).toBe(202);
    const page = await waitDone(u.token);
    expect(page.summaryStatus).toBe('error');
    expect(page.summaryError).toContain('créditos foram devolvidos');
    expect(llm.calls).toBe(2); // tentou duas vezes
    expect(await prisma.foodSummary.count()).toBe(0);
    expect(await credits(u.user.id)).toBe(20);
  });

  it('IA fora do ar: erro na tela e crédito devolvido; dá para tentar de novo', async () => {
    const u = await withLdlHigh();
    llm.fail = true;
    await api().post('/api/items/food-guide/summary').set(authHeader(u.token)).send({});
    const page = await waitDone(u.token);
    expect(page.summaryStatus).toBe('error');
    expect(await credits(u.user.id)).toBe(20);
    llm.fail = false;
    const retry = await api().post('/api/items/food-guide/summary').set(authHeader(u.token)).send({});
    expect(retry.status).toBe(202);
    expect((await waitDone(u.token)).summary.content.resumo).toBe(GOOD.resumo);
    expect(await credits(u.user.id)).toBe(15);
  });

  it('sem saldo: 402 e a IA nem é chamada', async () => {
    const u = await withLdlHigh();
    await prisma.user.update({ where: { id: u.user.id }, data: { credits: 2 } });
    const r = await api().post('/api/items/food-guide/summary').set(authHeader(u.token)).send({});
    expect(r.status).toBe(402);
    expect(r.body.code).toBe('INSUFFICIENT_CREDITS');
    expect(llm.calls).toBe(0);
    expect(await credits(u.user.id)).toBe(2);
  });

  it('sem exame fora da faixa: 400, sem cobrança', async () => {
    const u = await createUser({ credits: 20 });
    const r = await api().post('/api/items/food-guide/summary').set(authHeader(u.token)).send({});
    expect(r.status).toBe(400);
    expect(await credits(u.user.id)).toBe(20);
  });

  it('exige login', async () => {
    expect((await api().post('/api/items/food-guide/summary').send({})).status).toBe(401);
  });
});
