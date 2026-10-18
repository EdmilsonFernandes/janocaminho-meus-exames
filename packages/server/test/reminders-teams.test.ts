import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, resetDb, createUser, createDoctor } from './helpers';
import { prisma } from '../src/prisma';
import { rollRecurringReminders } from '../src/jobs/reminderEmails';
import { encryptPII } from '../src/utils/crypto';

// Meet API: mockada — nunca sai pra internet (o resto do módulo fica real p/ hasMeetConfig).
vi.mock('../src/utils/meet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/meet')>();
  return { ...actual, createMeetSpace: vi.fn(async () => ({ uri: 'https://meet.google.com/auto-mock', code: 'auto-mock' })) };
});

/**
 * Lote "encontro estilo Teams" (18/10/26): recorrência que ROLA, teleconsulta com link
 * externo + consentimento Art. 15, e agendamento pelo portal do médico.
 */
const H = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 86_400_000;

describe('roll de recorrência (rollRecurringReminders)', () => {
  beforeEach(async () => { await resetDb(); });

  it('lembrete MENSAL vencido há >24h rola p/ próxima data e rearma disparos', async () => {
    const { user, patient } = await createUser();
    const due = new Date(Date.now() - 40 * DAY); // venceu há 40 dias (janela de tolerância passou)
    const r = await prisma.reminder.create({
      data: { ownerId: user.id, patientId: patient.id, title: 'Vitamina D', dueDate: due, notifyOffsetsMin: [1440, 0], sentOffsets: [1440, 0], recurrence: 'mensal' },
    });
    await rollRecurringReminders(Date.now());
    const after = await prisma.reminder.findUnique({ where: { id: r.id } });
    // 40 dias atrás + roll mensal (catch-up) → primeira ocorrência FUTURA
    expect(after!.dueDate.getTime()).toBeGreaterThan(Date.now());
    expect(after!.sentOffsets).toEqual([]);           // disparos rearmados
    expect(after!.done).toBe(false);
  });

  it('marcar FEITO rola IMEDIATAMENTE (sem esperar atraso) e renova o consentimento', async () => {
    const { user, patient } = await createUser();
    const r = await prisma.reminder.create({
      data: { ownerId: user.id, patientId: patient.id, title: 'Teleconsulta mensal', dueDate: new Date(Date.now() + 3 * DAY), type: 'teleconsulta', linkUrl: 'https://meet.google.com/abc', recurrence: 'mensal', consentAt: new Date() },
    });
    await prisma.reminder.update({ where: { id: r.id }, data: { done: true } });
    await rollRecurringReminders(Date.now());
    const after = await prisma.reminder.findUnique({ where: { id: r.id } });
    expect(after!.done).toBe(false);
    expect(after!.dueDate.getTime()).toBeGreaterThan(Date.now() + 25 * DAY); // ~1 mês à frente
    expect(after!.consentAt).toBeNull(); // cada teleconsulta pede aceite PRÓPRIO (Art. 15)
  });

  it('SEM recorrência nunca é tocado pelo roll', async () => {
    const { user, patient } = await createUser();
    const r = await prisma.reminder.create({
      data: { ownerId: user.id, patientId: patient.id, title: 'Exame único', dueDate: new Date(Date.now() - 40 * DAY) },
    });
    await rollRecurringReminders(Date.now());
    const after = await prisma.reminder.findUnique({ where: { id: r.id } });
    expect(after!.dueDate.getTime()).toBe(r.dueDate.getTime()); // intocado
  });

  it('diário atrasado 5 dias pula as ocorrências perdidas (catch-up, não 5 rolls)', async () => {
    const { user, patient } = await createUser();
    const r = await prisma.reminder.create({
      data: { ownerId: user.id, patientId: patient.id, title: 'Medicação', dueDate: new Date(Date.now() - 5 * DAY), recurrence: 'diario' },
    });
    await rollRecurringReminders(Date.now());
    const after = await prisma.reminder.findUnique({ where: { id: r.id } });
    expect(after!.dueDate.getTime()).toBeGreaterThan(Date.now());
    expect(after!.dueDate.getTime()).toBeLessThan(Date.now() + 2 * DAY); // 1 passo à frente, não 5
  });
});

describe('teleconsulta — criação, consentimento e validações', () => {
  beforeEach(async () => { await resetDb(); });

  it('PACIENTE cria teleconsulta com link e recorrência (POST /api/reminders)', async () => {
    const { token, patient } = await createUser();
    const r = await api().post('/api/reminders').set(H(token)).send({
      patientId: patient.id, title: 'Teleconsulta cardiologista',
      dueDate: new Date(Date.now() + 3 * DAY).toISOString(),
      type: 'teleconsulta', linkUrl: 'https://meet.google.com/xyz-abc', recurrence: 'mensal',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ type: 'teleconsulta', linkUrl: 'https://meet.google.com/xyz-abc', recurrence: 'mensal', consentAt: null });
  });

  it('teleconsulta SEM link é rejeitada (o botão Entrar precisa de destino)', async () => {
    const { token, patient } = await createUser();
    const r = await api().post('/api/reminders').set(H(token)).send({
      patientId: patient.id, title: 'Sem link', dueDate: new Date().toISOString(), type: 'teleconsulta',
    });
    expect(r.status).toBe(400);
  });

  it('link não-http é rejeitado (whitelist — nunca javascript: ou afins)', async () => {
    const { token, patient } = await createUser();
    const r = await api().post('/api/reminders').set(H(token)).send({
      patientId: patient.id, title: 'Link ruim', dueDate: new Date().toISOString(), type: 'teleconsulta', linkUrl: 'javascript:alert(1)',
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('link');
  });

  it('CONSENTIMENTO (PUT /:id/consent): carimba UMA vez, só p/ teleconsulta, só pro dono', async () => {
    const { token, patient } = await createUser();
    const r = await api().post('/api/reminders').set(H(token)).send({
      patientId: patient.id, title: 'Tele', dueDate: new Date(Date.now() + DAY).toISOString(), type: 'teleconsulta', linkUrl: 'https://meet.google.com/ok',
    });
    const c1 = await api().put(`/api/reminders/${r.body.id}/consent`).set(H(token));
    expect(c1.status).toBe(200);
    expect(c1.body.consentAt).toBeTruthy();
    // Re-aceitar não re-carimba (o PRIMEIRO aceite é o que vale — histórico preservado)
    await new Promise((res) => setTimeout(res, 20));
    const c2 = await api().put(`/api/reminders/${r.body.id}/consent`).set(H(token));
    expect(c2.body.consentAt).toBe(c1.body.consentAt);

    // Lembrete comum → 400
    const plain = await api().post('/api/reminders').set(H(token)).send({ patientId: patient.id, title: 'Exame', dueDate: new Date().toISOString() });
    const c3 = await api().put(`/api/reminders/${plain.body.id}/consent`).set(H(token));
    expect(c3.status).toBe(400);

    // Outro usuário → 404 (não vaza)
    const b = await createUser();
    const c4 = await api().put(`/api/reminders/${r.body.id}/consent`).set(H(b.token));
    expect(c4.status).toBe(404);
  });
});

describe('MÉDICO agenda teleconsulta (POST /doctor/patients/:id/teleconsulta)', () => {
  beforeEach(async () => { await resetDb(); });

  it('cria lembrete type=teleconsulta na conta do PACIENTE com push-friendly defaults', async () => {
    const { token, user, patient } = await createUser();
    const crm = '97531-SP';
    const { token: docToken } = await createDoctor({ crm, email: 'tele1@t.com' });
    await api().post('/api/doctor-shares').set(H(token)).send({ doctorCrm: crm, scopes: ['exams'] });

    const r = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H(docToken)).send({
      dueDate: new Date(Date.now() + 2 * DAY).toISOString(), linkUrl: 'https://meet.google.com/doc-123',
    });
    console.log('DEBUG_TELE', r.status, JSON.stringify(r.body));
    expect(r.status).toBe(201);
    expect(r.body.reminder).toMatchObject({
      patientId: patient.id, ownerId: user.id, type: 'teleconsulta',
      linkUrl: 'https://meet.google.com/doc-123', createdByDoctorId: expect.any(String),
    });
    expect(r.body.reminder.notifyOffsetsMin).toEqual([1440, 60, 0]); // 1 dia · 1h · na hora
    expect(r.body.reminder.title).toMatch(/Teleconsulta/);
  });

  it('sem share ativo → 403; link ausente → 400', async () => {
    const { user, patient } = await createUser();
    const { token: docToken } = await createDoctor({ crm: '11223-SP', email: 'tele2@t.com' });
    const r = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H(docToken)).send({ dueDate: new Date().toISOString(), linkUrl: 'https://x.com' });
    expect(r.status).toBe(403);

    // Com share, mas link inválido → 400 (nada é criado)
    const { token, patient: p2 } = await createUser();
    const crm2 = '33445-SP';
    const doc2 = await createDoctor({ crm: crm2, email: 'tele3@t.com' });
    await api().post('/api/doctor-shares').set(H(token)).send({ doctorCrm: crm2, scopes: ['exams'] });
    const bad = await api().post(`/api/doctor/patients/${p2.id}/teleconsulta`).set(H(doc2.token)).send({ dueDate: new Date().toISOString(), linkUrl: 'sem-link' });
    expect(bad.status).toBe(400);
    expect(await prisma.reminder.count({ where: { patientId: p2.id } })).toBe(0);
  });

  it('createMeet SEM conta conectada → 400 com instruções (não tenta gerar)', async () => {
    const { token, patient } = await createUser();
    const crm = '55667-SP';
    const { token: docToken } = await createDoctor({ crm, email: 'tele4@t.com' });
    await api().post('/api/doctor-shares').set(H(token)).send({ doctorCrm: crm, scopes: ['exams'] });
    const r = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H(docToken)).send({ dueDate: new Date().toISOString(), createMeet: true });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('Conecte');
  });

  it('createMeet COM conta conectada → sala gerada vira o linkUrl (nada colado)', async () => {
    const { token, patient } = await createUser();
    const crm = '77889-SP';
    const { token: docToken, doctor } = await createDoctor({ crm, email: 'tele5@t.com' });
    await api().post('/api/doctor-shares').set(H(token)).send({ doctorCrm: crm, scopes: ['exams'] });
    // "Conecta o Google": refresh token criptografado como o fluxo OAuth faria.
    const enc = encryptPII('mock-refresh-token');
    expect(enc).toBeTruthy();
    await prisma.doctor.update({ where: { id: doctor.id }, data: { googleRefreshTokenEnc: enc!.enc, googleRefreshTokenIv: enc!.iv } });

    const r = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H(docToken)).send({ dueDate: new Date(Date.now() + DAY).toISOString(), createMeet: true });
    expect(r.status).toBe(201);
    expect(r.body.reminder.linkUrl).toBe('https://meet.google.com/auto-mock');
  });

  it('GET /google/status e /google/auth degradam sem GOOGLE_CLIENT_SECRET (padrão da casa)', async () => {
    // stubEnv: o dev/prod podem TER o secret (desde 18/10/26) — o teste precisa ser
    // determinístico independente do .env da máquina que roda.
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    try {
      const { token: docToken } = await createDoctor({ crm: '88990-SP', email: 'tele6@t.com' });
      const s = await api().get('/api/doctor/google/status').set(H(docToken));
      expect(s.status).toBe(200);
      expect(s.body).toMatchObject({ configured: false, connected: false });
      const a = await api().get('/api/doctor/google/auth').set(H(docToken));
      expect(a.status).toBe(501);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
