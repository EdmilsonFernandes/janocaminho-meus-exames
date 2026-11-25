// "Hora de repetir o exame" (25/11/26): cálculo do prazo, texto do aviso, rota da Home e o job.
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { createUser, createExam, createItem, api, authHeader, resetDb } from './helpers';
import { planRetest, retestMessage } from '../src/analysis/retest';
import { runRetestReminders } from '../src/jobs/retestReminder';

const day = 86400000;
const ago = (days: number) => new Date(Date.now() - days * day);

describe('planRetest — prazo por exame', () => {
  const now = new Date('2026-11-25T12:00:00Z');

  it('exame com valor fora da faixa → 3 meses, citando até 3 exames sem repetir', () => {
    const p = planRetest({ id: 'e1', date: new Date('2026-08-25T12:00:00Z'), abnormal: ['Colesterol LDL', 'Colesterol LDL', 'Glicose', 'TSH', 'Ferritina'] }, now);
    expect(p.reason).toBe('alterado');
    expect(p.months).toBe(3);
    expect(p.markers).toEqual(['Colesterol LDL', 'Glicose', 'TSH']);
    expect(p.dueAt.slice(0, 10)).toBe('2026-11-25');
    expect(p.status).toBe('chegou');
  });

  it('exame todo dentro da faixa → 12 meses', () => {
    const p = planRetest({ id: 'e2', date: new Date('2026-06-01T12:00:00Z'), abnormal: [] }, now);
    expect(p.reason).toBe('rotina');
    expect(p.months).toBe(12);
    expect(p.dueAt.slice(0, 10)).toBe('2027-06-01');
    expect(p.status).toBe('longe');
  });

  it('faltando até 30 dias → "chegando"; dia 31 somado a mês curto cai no último dia', () => {
    const soon = planRetest({ id: 'e3', date: new Date('2026-09-10T12:00:00Z'), abnormal: ['TGO'] }, now);
    expect(soon.status).toBe('chegando');
    expect(soon.daysUntil).toBe(15);
    const fimDeMes = planRetest({ id: 'e4', date: new Date('2026-11-30T12:00:00Z'), abnormal: ['TGO'] }, now);
    expect(fimDeMes.dueAt.slice(0, 10)).toBe('2027-02-28');
  });

  it('o texto lembra o prazo e aponta o médico — nunca manda repetir nem fala em doença', () => {
    const p = planRetest({ id: 'e1', date: new Date('2026-08-25T12:00:00Z'), abnormal: ['Colesterol LDL', 'Glicose'] }, now);
    const m = retestMessage('Maria', p);
    expect(m.title).toBe('Maria, faz 3 meses do seu exame');
    expect(m.body).toContain('Colesterol LDL e Glicose saíram da faixa');
    expect(m.body).toContain('seu médico');
    expect(m.body).not.toMatch(/você deve|precisa repetir|diagn|doença|tratamento/i);
    const um = retestMessage('', planRetest({ id: 'e1', date: new Date('2026-08-25T12:00:00Z'), abnormal: ['TSH'] }, now));
    expect(um.title).toBe('faz 3 meses do seu exame');
    expect(um.body).toContain('TSH saiu da faixa');
    const rotina = retestMessage('João', planRetest({ id: 'e2', date: new Date('2025-11-20T12:00:00Z'), abnormal: [] }, now));
    expect(rotina.title).toBe('João, faz 1 ano do seu último exame');
  });
});

describe('rota e job do lembrete de repetir exame', () => {
  beforeEach(async () => { await resetDb(); });

  async function userWithExam(daysAgo: number, abnormal: string[]) {
    const u = await createUser();
    const patient = await prisma.patient.findFirstOrThrow({ where: { ownerId: u.user.id } });
    const exam = await createExam(patient.id, { status: 'EXTRACTED', performedAt: ago(daysAgo) });
    for (const name of abnormal) await createItem(exam.id, { name, isAbnormal: true });
    await createItem(exam.id, { name: 'Hemoglobina', isAbnormal: false });
    return { u, patient, exam };
  }

  it('GET /api/retest devolve o plano do exame mais recente; sem exame → plan null; exige login', async () => {
    expect((await api().get('/api/retest')).status).toBe(401);
    const vazio = await createUser();
    expect((await api().get('/api/retest').set(authHeader(vazio.token))).body).toEqual({ plan: null });

    const { u, exam } = await userWithExam(100, ['Colesterol LDL']);
    const r = await api().get('/api/retest').set(authHeader(u.token));
    expect(r.status).toBe(200);
    expect(r.body.plan).toMatchObject({ examId: exam.id, reason: 'alterado', months: 3, markers: ['Colesterol LDL'], status: 'chegou' });
  });

  it('paciente de outra conta não vaza: cai no titular de quem pediu', async () => {
    const a = await userWithExam(100, ['TSH']);
    const b = await userWithExam(10, []);
    const r = await api().get(`/api/retest?patientId=${a.patient.id}`).set(authHeader(b.u.token));
    expect(r.body.plan.examId).toBe(b.exam.id);
  });

  it('job avisa UMA vez por exame, só quando o prazo chegou, e não chama por exame muito antigo', async () => {
    const venceu = await userWithExam(95, ['Colesterol LDL']); // 3 meses + 5 dias → avisa
    const cedo = await userWithExam(40, ['Glicose']); // ainda não → nada
    const rotina = await userWithExam(200, []); // rotina, falta muito → nada
    const antigo = await userWithExam(400, ['TSH']); // venceu há ~10 meses → nada

    expect(await runRetestReminders()).toBe(1);
    const n = await prisma.notification.findMany({ where: { type: 'retest' } });
    expect(n).toHaveLength(1);
    expect(n[0].userId).toBe(venceu.u.user.id);
    expect(n[0].title).toContain('faz 3 meses do seu exame');
    expect(n[0].body).toContain('Colesterol LDL saiu da faixa');
    expect((n[0].data as { examId: string }).examId).toBe(venceu.exam.id);
    for (const other of [cedo, rotina, antigo]) {
      expect(await prisma.notification.count({ where: { userId: other.u.user.id, type: 'retest' } })).toBe(0);
    }

    expect(await runRetestReminders()).toBe(0); // rodada seguinte: nada de novo
    expect(await prisma.notification.count({ where: { type: 'retest' } })).toBe(1);

    // exame novo reinicia o ciclo: o exame novo é o "mais recente" e ainda não venceu
    await createExam(venceu.patient.id, { status: 'EXTRACTED', performedAt: ago(1) });
    expect(await runRetestReminders()).toBe(0);
  });

  it('conta bloqueada não recebe', async () => {
    const x = await userWithExam(95, ['Ferritina']);
    await prisma.user.update({ where: { id: x.u.user.id }, data: { blocked: true } });
    expect(await runRetestReminders()).toBe(0);
  });
});
