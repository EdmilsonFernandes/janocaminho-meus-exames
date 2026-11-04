import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeader, createUser, resetDb, mintToken } from './helpers';
import { prisma } from '../src/prisma';

/** Lote ReUI (04/11/26): agregações e consentimento com assinatura.
 *  - GET /billing/usage agrega o GASTO de IA do mês corrente (kinds de IA, delta<0),
 *    com rótulo humano, e ignora lançamentos de outros meses/kinds.
 *  - PUT /reminder/:id/consent aceita assinatura PNG (dataURL) e o GET devolve a imagem.
 *  - GET /admin/ai-usage agrega AiUsageLog (admin) e bloqueia não-admin. */

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({ data: { email: `admin-reui-${Date.now().toString(36)}@exemplo.com`, name: 'Admin ReUI', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true } });
  return { id: u.id, token: mintToken(u.id) };
}

describe('Lote ReUI 04/11 — uso do mês, assinatura de consent e consumo de IA', () => {
  beforeEach(resetDb);

  it('GET /billing/usage agrega gasto de IA do mês corrente com label humana', async () => {
    const { user, token } = await createUser({ credits: 100 });
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    await prisma.creditTransaction.createMany({
      data: [
        { userId: user.id, delta: -2, kind: 'ai_chat', label: 'chat' },
        { userId: user.id, delta: -3, kind: 'ai_chat', label: 'chat' },
        { userId: user.id, delta: -10, kind: 'ai_summary', label: 'resumo' },
        { userId: user.id, delta: -99, kind: 'ai_chat', label: 'mês passado', createdAt: lastMonth }, // fora da janela
        { userId: user.id, delta: 50, kind: 'plan_monthly', label: 'ganho' }, // positivo: nunca é gasto
      ],
    });

    const r = await api().get('/api/billing/usage').set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.month).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

    const chat = r.body.items.find((i: { kind: string }) => i.kind === 'ai_chat');
    expect(chat.spent).toBe(5);
    expect(chat.uses).toBe(2);
    expect(chat.label).toBe('Chat com a IA');

    const summary = r.body.items.find((i: { kind: string }) => i.kind === 'ai_summary');
    expect(summary.spent).toBe(10);

    // mês passado e ganhos não entram na agregação
    const kinds = r.body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).not.toContain('plan_monthly');
    expect(chat.spent).not.toBe(104);
  });

  it('PUT /reminder/:id/consent com assinatura grava PNG e GET devolve a imagem', async () => {
    const { user, token } = await createUser({ credits: 0 });
    const patient = await prisma.patient.create({ data: { ownerId: user.id, fullName: 'Paciente ReUI' } });
    const reminder = await prisma.reminder.create({
      data: { patientId: patient.id, ownerId: user.id, title: 'Teleconsulta', dueDate: new Date(), type: 'teleconsulta' },
    });

    const pngB64 = Buffer.from('assinatura-ficticia-png').toString('base64');
    const r = await api().put(`/api/reminders/${reminder.id}/consent`).set(authHeader(token)).send({ signature: `data:image/png;base64,${pngB64}` });
    expect(r.status).toBe(200);
    expect(r.body.consentAt).toBeTruthy();
    expect(r.body.signed).toBe(true);

    const img = await api().get(`/api/reminders/${reminder.id}/consent-signature`).set(authHeader(token));
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toContain('image/png');

    // sem assinatura: fluxo textual de sempre continua funcionando (retrocompat)
    const r2 = await prisma.reminder.findUnique({ where: { id: reminder.id }, select: { consentSignaturePath: true } });
    expect(r2?.consentSignaturePath).toBeTruthy();
  });

  it('PUT /consent rejeita assinatura que não é dataURL PNG', async () => {
    const { user, token } = await createUser({ credits: 0 });
    const patient = await prisma.patient.create({ data: { ownerId: user.id, fullName: 'Paciente ReUI 2' } });
    const reminder = await prisma.reminder.create({
      data: { patientId: patient.id, ownerId: user.id, title: 'Teleconsulta', dueDate: new Date(), type: 'teleconsulta' },
    });
    const r = await api().put(`/api/reminders/${reminder.id}/consent`).set(authHeader(token)).send({ signature: 'javascript:alert(1)' });
    expect(r.status).toBe(400);
  });

  it('GET /admin/ai-usage agrega por feature e bloqueia não-admin', async () => {
    const { user, token } = await createUser({ credits: 0 });
    await prisma.aiUsageLog.createMany({
      data: [
        { userId: user.id, feature: 'CHAT', model: 'glm-4.6', promptTokens: 100, completionTokens: 50, costBrl: 0.01, latencyMs: 900, success: true },
        { userId: user.id, feature: 'CHAT', model: 'glm-4.6', promptTokens: 100, completionTokens: 50, costBrl: 0.01, latencyMs: 1100, success: false },
        { userId: user.id, feature: 'SUMMARY', model: 'glm-4.6', promptTokens: 500, completionTokens: 200, costBrl: 0.05, latencyMs: 2000, success: true },
      ],
    });

    const forbidden = await api().get('/api/admin/ai-usage').set(authHeader(token));
    expect(forbidden.status).toBe(403);

    const admin = await createAdmin();
    const r = await api().get('/api/admin/ai-usage?days=30').set(authHeader(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.days).toBe(30);
    expect(r.body.totals.calls).toBe(3);
    expect(r.body.totals.costBrl).toBeCloseTo(0.07, 3);

    const chat = r.body.features.find((f: { feature: string }) => f.feature === 'CHAT');
    expect(chat.calls).toBe(2);
    expect(chat.avgLatencyMs).toBe(1000);
    expect(r.body.totals.errorRate).toBeCloseTo(33.3, 1);

    expect(r.body.topUsers[0].userId).toBe(user.id);
    expect(r.body.topUsers[0].costBrl).toBeCloseTo(0.07, 3);
  });
});
