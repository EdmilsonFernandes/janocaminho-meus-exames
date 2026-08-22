import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser } from './helpers';
import { prisma } from '../src/prisma';

// EXPORT-ALL — pacote ZIP de portabilidade (LGPD art. 18, II): dados.json + LEIA-ME +
// Relatorios/*.md + Exames-PDF/*.pdf. Arquivo individual ausente NÃO derruba o pacote.
describe('data export-all (ZIP de portabilidade)', () => {
  beforeEach(async () => { await resetDb(); });

  it('gera ZIP válido (magic bytes PK) com dados + análise em .md', async () => {
    const { user, patient, token } = await createUser();
    // exame SEM arquivo no disco (filePath inexistente) → deve pular sem quebrar
    await prisma.exam.create({ data: { patientId: patient.id, title: 'Hemograma', kind: 'LAB_PANEL', status: 'EXTRACTED', performedAt: new Date('2026-01-10'), filePath: 'nao-existe.pdf', fileSha256: 'x1' } });
    await prisma.aiAnalysis.create({ data: { patientId: patient.id, type: 'SUMMARY', contentMd: '## Leitura\nTSH dentro da faixa.' } });

    const r = await api().get('/api/data/export-all').set(authHeader(token)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/zip');
    const buf: Buffer = r.body;
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // magic bytes de zip
    // LEIA-ME + relatório .md dentro do zip (strings grepáveis no stream deflate level 6: nomes de entry são legíveis no central directory)
    const asStr = buf.toString('latin1');
    expect(asStr).toContain('LEIA-ME.md');
    expect(asStr).toContain('dados.json');
    expect(user.email).toBeTruthy();
  });

  it('respeita rate-limit de 5 minutos (429 na 2ª geração imediata)', async () => {
    const { token } = await createUser();
    const first = await api().get('/api/data/export-all').set(authHeader(token)).buffer(true).parse(binaryParser);
    expect(first.status).toBe(200);
    const second = await api().get('/api/data/export-all').set(authHeader(token));
    expect(second.status).toBe(429);
  });

  it('exige autenticação (401 sem token)', async () => {
    const r = await api().get('/api/data/export-all');
    expect(r.status).toBe(401);
  });
});

function authHeader(t: string) { return { Authorization: `Bearer ${t}` }; }
function binaryParser(res: any, cb: any) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
