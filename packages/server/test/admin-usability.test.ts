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
