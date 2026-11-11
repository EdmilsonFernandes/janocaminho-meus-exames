import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeader, createUser, resetDb, mintToken, createPatient, createExam } from './helpers';
import { prisma } from '../src/prisma';

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({ data: { email: `admin-${Date.now().toString(36)}@exemplo.com`, name: 'Admin Teste', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true } });
  return { id: u.id, token: mintToken(u.id) };
}

/** Usabilidade (28/09): /admin/feature-usage deriva funil de ativação + adoção de features
 *  dos dados já gravados. Regride o pedido do dono: "quem cadastrou remédios, quem ligou
 *  Libras, quem subiu 1º exame — com e-mail e ordem mais recente". */
describe('Admin /feature-usage — visão de usabilidade', () => {
  beforeEach(resetDb);

  it('funil de ativação conta 1º exame e uso de IA; features trazem contagem + últimos usuários com e-mail', async () => {
    const owner = await createUser({ name: 'Maria Silva' });
    const dep = await createPatient(owner.user.id, { fullName: 'Filho', relationship: 'Filho(a)' });
    const depId = dep.id;
    await createExam(depId); // 1º exame (EXTRACTED default)
    await prisma.medication.create({ data: { patientId: depId, name: 'Losartana' } });
    await prisma.mentalHealthScreening.create({ data: { patientId: depId, type: 'phq9', total: 4, answers: [0, 0, 1, 0, 0, 0, 1, 1, 1] } });
    await prisma.user.update({ where: { id: owner.user.id }, data: { librasEnabled: true } });
    await prisma.aiUsageLog.create({ data: { userId: owner.user.id, feature: 'CONSOLIDATED', model: 'test' } });

    const admin = await createAdmin();
    const r = await api().get('/api/admin/feature-usage').set(authHeader(admin.token));
    expect(r.status).toBe(200);

    // Funil: 1 OWNER verificado, com 1º exame e uso de IA
    expect(r.body.funnel.signups).toBe(1);
    expect(r.body.funnel.verified).toBe(1);
    expect(r.body.funnel.firstExam).toBe(1);
    expect(r.body.funnel.usedAI).toBe(1);

    const byKey = Object.fromEntries(r.body.features.map((f: any) => [f.key, f]));
    // Remédios: 1 usuário, e o recente traz o e-mail de QUEM cadastrou (owner do paciente)
    expect(byKey['medicacoes'].users).toBe(1);
    expect(byKey['medicacoes'].recent[0].email).toBe(owner.user.email);
    // Dependente: relationship ≠ Titular conta o owner que adicionou
    expect(byKey['dependentes'].users).toBe(1);
    // Libras: espelho server (coluna nova) aparece
    expect(byKey['libras'].users).toBe(1);
    expect(byKey['libras'].recent[0].email).toBe(owner.user.email);
    // Saúde mental (tabela nova — drift-safe no servidor real, presente no teste)
    expect(byKey['saude-mental'].users).toBe(1);
    // Relatório consolidado via ai_usage_logs
    expect(byKey['relatorio'].users).toBe(1);
  });

  // Regressão 11/11 (dono: "tá zoado"): numerador e denominador na MESMA base, pessoas
  // distintas nos recentes, e lembrete criado pelo médico/teleconsulta não é uso do paciente.
  it('conta só a base verificada não-teste, sem repetir a mesma pessoa nos recentes', async () => {
    const maria = await createUser({ name: 'Maria Silva' });
    const pMaria = await createPatient(maria.user.id, { fullName: 'Maria Silva' });
    for (const name of ['Losartana', 'Metformina', 'Sinvastatina']) {
      await prisma.medication.create({ data: { patientId: pMaria.id, name } });
    }
    // Conta de teste e conta não verificada também cadastram remédio — ficam FORA.
    const teste = await createUser({ name: 'Conta Teste' });
    await prisma.user.update({ where: { id: teste.user.id }, data: { isTest: true } });
    const naoVerificado = await createUser({ name: 'Sem Verificar' });
    await prisma.user.update({ where: { id: naoVerificado.user.id }, data: { emailVerified: false } });
    for (const u of [teste, naoVerificado]) {
      const p = await createPatient(u.user.id, { fullName: 'X' });
      await prisma.medication.create({ data: { patientId: p.id, name: 'Dipirona' } });
    }
    // Lembrete do próprio paciente conta; teleconsulta agendada pelo médico não.
    await prisma.reminder.create({ data: { patientId: pMaria.id, ownerId: maria.user.id, title: 'Refazer hemograma', dueDate: new Date() } });
    const joao = await createUser({ name: 'João' });
    const pJoao = await createPatient(joao.user.id, { fullName: 'João' });
    await prisma.reminder.create({ data: { patientId: pJoao.id, ownerId: joao.user.id, title: 'Teleconsulta', dueDate: new Date(), type: 'teleconsulta', createdByDoctorId: 'doc-1' } });

    const admin = await createAdmin();
    const r = await api().get('/api/admin/feature-usage').set(authHeader(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.funnel.signups).toBe(3); // maria, joão, não verificado (teste fora)
    expect(r.body.funnel.verified).toBe(2);

    const byKey = Object.fromEntries(r.body.features.map((f: any) => [f.key, f]));
    expect(byKey['medicacoes'].users).toBe(1);
    expect(byKey['medicacoes'].users30).toBe(1);
    expect(byKey['medicacoes'].pct).toBe(50);
    expect(byKey['medicacoes'].recent).toHaveLength(1);
    expect(byKey['medicacoes'].recent[0].email).toBe(maria.user.email);
    expect(byKey['lembretes'].users).toBe(1);
    expect(byKey['lembretes'].recent[0].email).toBe(maria.user.email);
    expect(byKey['teleconsulta'].users).toBe(1);
    expect(byKey['teleconsulta'].recent[0].email).toBe(joao.user.email);
    // Toda feature vem categorizada pelo servidor (o filtro do front depende disso).
    expect(r.body.features.every((f: any) => ['clinico', 'ia', 'rotina', 'conta'].includes(f.category))).toBe(true);
    expect(r.body.features.every((f: any) => f.pct <= 100)).toBe(true);
  });

  it('usuário comum (não-admin) não acessa', async () => {
    const owner = await createUser();
    const r = await api().get('/api/admin/feature-usage').set(authHeader(owner.token));
    expect(r.status).toBeGreaterThanOrEqual(403);
  });

  it('base vazia: funil zera sem quebrar e % não divide por zero', async () => {
    const admin = await createAdmin();
    const r = await api().get('/api/admin/feature-usage').set(authHeader(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.funnel.signups).toBe(0);
    expect(r.body.funnel.firstExam).toBe(0);
    expect(Array.isArray(r.body.features)).toBe(true);
    expect(r.body.features.every((f: any) => Number.isFinite(f.pct))).toBe(true);
  });
});
