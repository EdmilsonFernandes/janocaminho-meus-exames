import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { api, resetDb } from './helpers';

/**
 * "Decifre seu exame" (topo de funil público da landing): IA só EXTRAI valores, flags
 * determinísticas pela faixa do laudo, cache por hash (repetido = 0 chamada de IA),
 * caps de tamanho e resposta pública de até 8 itens. Rate-limit 3/dia/IP é config do
 * express-rate-limit (mesmo padrão dos 5 limiters do app — não re-testado aqui; em
 * dev/test o limiter é skipado como os demais).
 */
const calls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/llm', () => ({
  getModel: () => 'mock-model', // a rota resolve o modelo ativo — no mock, tanto faz
  getLlm: () => ({
    name: 'mock',
    complete: async () => {
      calls.count++;
      return {
        text: JSON.stringify({
          items: [
            { name: 'Hemoglobina', value: '13,5', unit: 'g/dL', refLow: '12', refHigh: '16' },
            { name: 'LDL', value: '190', unit: 'mg/dL', refLow: null, refHigh: '130' },
            { name: 'TSH', value: '7.32', unit: 'µUI/mL', refLow: '0.4', refHigh: '4' },
            { name: 'Sem Faixa', value: '50', unit: 'mg/dL', refLow: null, refHigh: null },
            { name: 'Lixo sem número', value: 'abc', unit: 'x' },
          ],
        }),
      };
    },
    stream: async () => { throw new Error('não usado'); },
  }),
}));

// PDF → texto: mockado (poppler não roda no CI do teste unitário; o fluxo real é E2E).
vi.mock('../src/extraction/pdfToText', () => ({
  pdfToText: async () => 'CABEÇALHO DO LABORATÓRIO\n' + 'x'.repeat(9_000) + '\n' + 'Hemoglobina 13,5 g/dL (12 - 16)\nLDL 190 mg/dL (< 130)\nTSH 7,32 µUI/mL (0,4 - 4)',
}));

const EXAME = `HEMOGRAMA COMPLETO
Hemoglobina 13,5 g/dL (12 - 16)
LDL 190 mg/dL (< 130)
TSH 7,32 µUI/mL (0,4 - 4)`;

describe('decifre (público, landing)', () => {
  beforeEach(async () => { await resetDb(); calls.count = 0; });

  it('extrai valores e classifica deterministicamente pela faixa do laudo', async () => {
    const r = await request((await import('../src/app')).app).post('/api/public/decifre').send({ texto: EXAME });
    expect(r.status).toBe(200);
    const items = r.body.items;
    expect(items.length).toBe(4); // 'Lixo sem número' (value não-numérica) cai fora
    const hb = items.find((i: any) => i.name === 'Hemoglobina');
    expect(hb.value).toBe(13.5); // vírgula vira ponto
    expect(hb.flag).toBe('NORMAL');
    expect(items.find((i: any) => i.name === 'LDL').flag).toBe('HIGH');
    expect(items.find((i: any) => i.name === 'TSH').flag).toBe('HIGH');
    expect(items.find((i: any) => i.name === 'Sem Faixa').flag).toBe('UNKNOWN');
    expect(r.body.cached).toBe(false);
    expect(r.body.disclaimer).toContain('não é diagnóstico');
    // Telemetria do funil: evento com contagens (sem texto do exame — LGPD)
    const { prisma } = await import('../src/prisma');
    const ev = await prisma.decifreEvent.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(ev?.itemsCount).toBe(4);
    expect(ev?.abnormalCount).toBe(2); // LDL + TSH
    expect(ev?.ipHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('texto repetido vem do CACHE (IA chamada só 1x)', async () => {
    const app = (await import('../src/app')).app;
    const first = await request(app).post('/api/public/decifre').send({ texto: EXAME + ' rev1' });
    expect(first.body.cached).toBe(false);
    const second = await request(app).post('/api/public/decifre').send({ texto: EXAME + ' rev1' });
    expect(second.body.cached).toBe(true);
    expect(calls.count).toBe(1);
  });

  it('validações: curto → 400; longo → 400', async () => {
    const app = (await import('../src/app')).app;
    expect((await request(app).post('/api/public/decifre').send({ texto: 'curto' })).status).toBe(400);
    expect((await request(app).post('/api/public/decifre').send({ texto: 'x'.repeat(4001) })).status).toBe(400);
    expect(calls.count).toBe(0);
  });

  it('PDF base64 com texto > 4k NÃO é rejeitado (é PDF, não texto colado)', async () => {
    // Regressão real: o front manda PDF por pdfBase64 (JSON — Chrome Android corrompe
    // multipart), mas a rota só isentava req.file do limite de 4k → PDF de lab real
    // (texto > 4k) era REJEITADO com "envie o PDF" pra quem tinha enviado um PDF.
    const app = (await import('../src/app')).app;
    const r = await request(app).post('/api/public/decifre').send({ pdfBase64: Buffer.from('fake-pdf').toString('base64') });
    expect(r.status).toBe(200); // era 400 antes do fix
    expect(r.body.items.length).toBeGreaterThanOrEqual(1); // decifrou o que importa
  });

  it('IA devolvendo lixo → 0 itens (rota responderia 422, não 500)', async () => {
    const { toPublicItems } = await import('../src/routes/decifre.routes');
    expect(toPublicItems({ items: [{ name: 'X', value: 'abc' }] })).toHaveLength(0);
    expect(toPublicItems(null)).toHaveLength(0);
    expect(toPublicItems({ items: 'não-array' })).toHaveLength(0);
  });
});
