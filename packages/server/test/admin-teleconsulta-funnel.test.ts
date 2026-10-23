// E2E (supertest) — GET /api/admin/teleconsultas/funnel.
// Funil: agendadas (createdAt na janela) → realizadas (JOIN dos 2 papéis, ou endedAt
// com join) / no-show (vencida +24h sem chamada) / pendentes; duração média
// (endedAt − 1º join, só das realizadas); retorno 30d; % consent (Art. 15).
// Joins são semeados DIRETO no auditLog — via rota real exigiria LiveKit.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

async function createAdmin() {
  const { user, token } = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  return token;
}

let seq = 0;

/** Semeia 1 teleconsulta (reminder type='teleconsulta') para 1 paciente novo. */
async function seedTele(o: { dueDate: Date; createdAt?: Date; consentAt?: Date; endedAt?: Date }) {
  seq += 1;
  const { user, patient } = await createUser();
  const { doctor } = await createDoctor({ crm: `${81000 + seq}-SP`, email: `fndoc${seq}@t.com` });
  return prisma.reminder.create({
    data: {
      ownerId: user.id,
      patientId: patient.id,
      title: 'Teleconsulta Funil QA',
      dueDate: o.dueDate,
      type: 'teleconsulta',
      notifyOffsetsMin: [60],
      createdByDoctorId: doctor.id,
      ...(o.consentAt ? { consentAt: o.consentAt } : {}),
      ...(o.endedAt ? { endedAt: o.endedAt } : {}),
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    } as any,
    select: { id: true },
  });
}

/** Audit JOIN — mesmo shape da rota real: after = { role, reminderId, room }. */
function joinLog(teleId: string, role: 'patient' | 'doctor', at: Date) {
  return prisma.auditLog.create({
    data: {
      actorType: role === 'doctor' ? 'DOCTOR' : 'USER',
      action: 'TELECONSULTA_JOIN',
      targetType: 'REMINDER',
      targetId: teleId,
      after: { role, reminderId: teleId, room: `teleconsulta-${teleId}` },
      createdAt: at,
    },
  });
}

describe('GET /api/admin/teleconsultas/funnel', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('200 com zero teleconsultas (shape estável, sem crash)', async () => {
    const admin = await createAdmin();
    const res = await api().get('/api/admin/teleconsultas/funnel').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      days: 30,
      total: 0,
      realizadas: 0,
      noShow: 0,
      pendentes: 0,
      realizacaoPct: 0,
      avgDurationMin: null,
      retorno30d: 0,
      consentPct: 0,
    });
  });

  it('funil: 1 realizada (2 papéis + endedAt), 1 no-show vencida, 1 futura', async () => {
    const admin = await createAdmin();
    const base = new Date(Date.now() - 2 * 86_400_000);

    const done = await seedTele({
      dueDate: base,
      consentAt: base,
      endedAt: new Date(base.getTime() + 15 * 60_000),
    });
    await joinLog(done.id, 'patient', base);
    await joinLog(done.id, 'doctor', new Date(base.getTime() + 60_000));

    // vencida há 3 dias, sem join → no-show
    await seedTele({ dueDate: new Date(Date.now() - 3 * 86_400_000) });
    // agendada para daqui 2 dias → pendente
    await seedTele({ dueDate: new Date(Date.now() + 2 * 86_400_000), consentAt: new Date() });

    const res = await api().get('/api/admin/teleconsultas/funnel?days=30').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      days: 30,
      total: 3,
      realizadas: 1,
      noShow: 1,
      pendentes: 1,
      realizacaoPct: 33,
      avgDurationMin: 15,
      retorno30d: 0,
      consentPct: 67,
    });
  });

  it('janela: teleconsulta criada fora do período não entra no funil', async () => {
    const admin = await createAdmin();
    await seedTele({
      dueDate: new Date(Date.now() - 9 * 86_400_000),
      createdAt: new Date(Date.now() - 8 * 86_400_000),
    });
    const res30 = await api().get('/api/admin/teleconsultas/funnel?days=30').set(authHeader(admin));
    expect(res30.status).toBe(200);
    expect(res30.body).toMatchObject({ days: 30, total: 1, noShow: 1 });
    const res7 = await api().get('/api/admin/teleconsultas/funnel?days=7').set(authHeader(admin));
    expect(res7.body).toMatchObject({ days: 7, total: 0, noShow: 0 });
  });

  it('retorno 30d: paciente com 2 realizadas dentro de 30d', async () => {
    const admin = await createAdmin();
    const { user, patient } = await createUser();
    const { doctor } = await createDoctor({ crm: '83000-SP', email: 'fndocr30@t.com' });
    const mk = async (due: Date) => {
      const r = await prisma.reminder.create({
        data: {
          ownerId: user.id,
          patientId: patient.id,
          title: 'Retorno QA',
          dueDate: due,
          type: 'teleconsulta',
          notifyOffsetsMin: [60],
          createdByDoctorId: doctor.id,
          consentAt: due,
          endedAt: new Date(due.getTime() + 10 * 60_000),
        } as any,
        select: { id: true },
      });
      await joinLog(r.id, 'patient', due);
      await joinLog(r.id, 'doctor', due);
    };
    await mk(new Date(Date.now() - 20 * 86_400_000));
    await mk(new Date(Date.now() - 5 * 86_400_000));
    const res = await api().get('/api/admin/teleconsultas/funnel?days=30').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 2,
      realizadas: 2,
      noShow: 0,
      retorno30d: 1,
      consentPct: 100,
      avgDurationMin: 10,
    });
  });

  it('não-admin → 403', async () => {
    const { token } = await createUser();
    const res = await api().get('/api/admin/teleconsultas/funnel').set(authHeader(token));
    expect(res.status).toBe(403);
  });
});
