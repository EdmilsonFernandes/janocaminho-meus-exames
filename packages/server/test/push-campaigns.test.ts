import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeader, createUser, createExam, createItem, resetDb, mintToken } from './helpers';
import { prisma } from '../src/prisma';
import { applyMergeFields, parseAudienceFilter, resolveAudienceUserIds } from '../src/utils/pushAudience';

const DAY = 24 * 60 * 60 * 1000;
let counter = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${counter++}`;
const dayStr = (offset: number) => new Date(Date.now() - offset * DAY).toISOString().slice(0, 10);

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({ data: { email: uniq('admin@exemplo.com'), name: 'Admin Teste', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true } });
  return { id: u.id, token: mintToken(u.id) };
}

/** User + device token (sem token não é audiência de push). */
async function reachable(opts: Parameters<typeof createUser>[0] = {}) {
  const t = await createUser(opts);
  await prisma.deviceToken.create({ data: { userId: t.user.id, token: uniq('tok-'), platform: 'android' } });
  return t;
}

/** Medição de passos do HC no dia (offset em dias). */
async function hcSteps(patientId: string, offsetDays: number, value: number) {
  await prisma.measurement.create({
    data: { patientId, type: 'STEPS', value, unit: 'passos', measuredAt: new Date(`${dayStr(offsetDays)}T12:00:00Z`), note: 'Health Connect' },
  });
}

describe('pushAudience — segmentos', () => {
  beforeEach(resetDb);

  it('só considera usuários alcançáveis (≥1 device token, não bloqueado)', async () => {
    const withToken = await reachable();
    await createUser(); // sem token
    const blocked = await reachable();
    await prisma.user.update({ where: { id: blocked.user.id }, data: { blocked: true } });

    const ids = await resolveAudienceUserIds({});
    expect(ids).toEqual([withToken.user.id]);
  });

  it('plano: premium vs free', async () => {
    const premium = await reachable({ premium: true });
    const free = await reachable();
    const expiring = await reachable();
    await prisma.user.update({ where: { id: expiring.user.id }, data: { planExpiresAt: new Date(Date.now() + 3 * DAY) } });

    expect(await resolveAudienceUserIds({ plan: 'premium' })).toContain(premium.user.id);
    const freeIds = await resolveAudienceUserIds({ plan: 'free' });
    expect(freeIds).toContain(free.user.id);
    expect(freeIds).not.toContain(premium.user.id);
    expect(await resolveAudienceUserIds({ plan: 'premiumExpiring7d' })).toContain(expiring.user.id);
  });

  it('engajamento: active7d / inactive14d / noFirstExam', async () => {
    const active = await reachable();
    await prisma.user.update({ where: { id: active.user.id }, data: { lastActiveDay: dayStr(2) } });
    const gone = await reachable();
    await prisma.user.update({ where: { id: gone.user.id }, data: { lastActiveDay: dayStr(20) } });
    const newbie = await reachable(); // nunca ativou → fora dos dois
    const noExam = await reachable();
    await prisma.user.update({ where: { id: noExam.user.id }, data: { lastActiveDay: dayStr(20) } });
    // noExam não tem exame EXTRAÍDO → entra em noFirstExam (e newbie também)

    expect(await resolveAudienceUserIds({ engagement: 'active7d' })).toContain(active.user.id);
    const inactive = await resolveAudienceUserIds({ engagement: 'inactive14d' });
    expect(inactive).toContain(gone.user.id);
    expect(inactive).not.toContain(active.user.id);
    expect(inactive).not.toContain(newbie.user.id);

    const firsts = await resolveAudienceUserIds({ engagement: 'noFirstExam' });
    expect(firsts).toContain(noExam.user.id);
    // quem tem exame extraído NÃO é "sem 1º exame"
    const withExam = await reachable();
    await createExam(withExam.patient.id, { status: 'EXTRACTED', performedAt: new Date() });
    expect(await resolveAudienceUserIds({ engagement: 'noFirstExam' })).not.toContain(withExam.user.id);
  });

  it('exames: stale90d (tem antigo, nada recente) e abnormal30d', async () => {
    const stale = await reachable();
    await createExam(stale.patient.id, { status: 'EXTRACTED', performedAt: new Date(Date.now() - 120 * DAY) });
    const fresh = await reachable();
    await createExam(fresh.patient.id, { status: 'EXTRACTED', performedAt: new Date(Date.now() - 5 * DAY) });
    const abnormal = await reachable();
    const abExam = await createExam(abnormal.patient.id, { status: 'EXTRACTED', performedAt: new Date(Date.now() - 10 * DAY) });
    await createItem(abExam.id, { isAbnormal: true });

    const staleIds = await resolveAudienceUserIds({ exams: 'stale90d' });
    expect(staleIds).toContain(stale.user.id);
    expect(staleIds).not.toContain(fresh.user.id);
    expect(await resolveAudienceUserIds({ exams: 'abnormal30d' })).toContain(abnormal.user.id);
  });

  it('atividade: goalHitYesterday e lowActivity3d (queda vs. própria média)', async () => {
    const champ = await reachable();
    await hcSteps(champ.patient.id, 1, 9000); // meta ontem

    const drop = await reachable();
    for (const d of [5, 6, 7]) await hcSteps(drop.patient.id, d, 8000); // base 8k/dia
    await hcSteps(drop.patient.id, 1, 1000);
    await hcSteps(drop.patient.id, 2, 1000); // despencou

    const goals = await resolveAudienceUserIds({ activity: 'goalHitYesterday' });
    expect(goals).toContain(champ.user.id);
    expect(goals).not.toContain(drop.user.id);
    expect(await resolveAudienceUserIds({ activity: 'lowActivity3d' })).toContain(drop.user.id);
  });

  it('cap anti-spam: quem recebeu manual_push há <7d fica de fora (e 0 desliga)', async () => {
    const recent = await reachable();
    await prisma.notification.create({ data: { userId: recent.user.id, type: 'manual_push', title: 't', body: 'b' } });
    const old = await reachable();
    await prisma.notification.create({ data: { userId: old.user.id, type: 'manual_push', title: 't', body: 'b', createdAt: new Date(Date.now() - 10 * DAY) } });

    const capped = await resolveAudienceUserIds({});
    expect(capped).not.toContain(recent.user.id);
    expect(capped).toContain(old.user.id);
    expect(await resolveAudienceUserIds({ excludeRecentManualDays: 0 })).toContain(recent.user.id);
  });

  it('interseção entre grupos (plano × atividade)', async () => {
    const premiumChamp = await reachable({ premium: true });
    await hcSteps(premiumChamp.patient.id, 1, 9000);
    const freeChamp = await reachable();
    await hcSteps(freeChamp.patient.id, 1, 9000);

    const ids = await resolveAudienceUserIds({ plan: 'premium', activity: 'goalHitYesterday' });
    expect(ids).toContain(premiumChamp.user.id);
    expect(ids).not.toContain(freeChamp.user.id);
  });
});

describe('pushAudience — merge fields', () => {
  it('substitui {{nome}}, {{streak}}, {{passosOntem}} com formatação pt-BR e fallback honesto', () => {
    const out = applyMergeFields('{{nome}}, {{streak}} dias e {{passosOntem}} passos!', { name: 'Edmilson Fernandes', streakDays: 7, stepsYesterday: 8432 });
    expect(out).toBe('Edmilson, 7 dias e 8.432 passos!');
    // sem dado de passos: placeholder degrada pra texto genérico (nunca "0" mentiroso)
    expect(applyMergeFields('Ontem: {{passosOntem}}', { name: 'Ana', streakDays: 0 })).toBe('Ontem: seus passos de ontem');
  });
});

describe('pushAudience — parseAudienceFilter', () => {
  it('rejeita valores desconhecidos (só chaves/valores do contrato)', () => {
    expect(parseAudienceFilter({ plan: 'free', hacker: 'DROP TABLE' })).toEqual({ plan: 'free' });
    expect(parseAudienceFilter({ engagement: 'xp; DROP' })).toEqual({});
    expect(parseAudienceFilter(null)).toEqual({});
  });
});

describe('Admin push segmentado — rotas', () => {
  beforeEach(resetDb);

  it('audience-preview conta usuários e dispositivos; exige admin', async () => {
    const a = await reachable({ premium: true });
    const b = await reachable({ premium: true });
    await prisma.deviceToken.create({ data: { userId: b.user.id, token: uniq('tok2-'), platform: 'android' } });
    const admin = await createAdmin();

    const r = await api().post('/api/admin/push/audience-preview').set(authHeader(admin.token)).send({ filter: { plan: 'premium' } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ users: 2, devices: 3 });

    const forbidden = await api().post('/api/admin/push/audience-preview').set(authHeader(a.token)).send({});
    expect(forbidden.status).toBe(403);
  });

  it('campaign dispara agora: Notification manual_push por usuário + PushCampaign com audienceFilter', async () => {
    const target = await reachable({ premium: true });
    const admin = await createAdmin();
    const r = await api().post('/api/admin/push/campaign').set(authHeader(admin.token)).send({
      title: 'Olá {{nome}}!',
      body: 'Seu streak é {{streak}} dias.',
      route: '/planos',
      filter: { plan: 'premium' },
    });
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe(1);

    const n = await prisma.notification.findFirst({ where: { userId: target.user.id, type: 'manual_push' } });
    expect(n?.title).toBe('Olá Usuário!'); // createUser name = 'Usuário Teste' → 1º nome
    const camp = await prisma.pushCampaign.findFirst({ where: { title: { startsWith: 'Olá' } } });
    expect(camp?.sentCount).toBe(1);
    expect(camp?.sentAt).toBeTruthy();
    expect((camp?.audienceFilter as any)?.plan).toBe('premium');
  });

  it('campaign sem filtro → 400 (todos = global deliberado)', async () => {
    const admin = await createAdmin();
    const r = await api().post('/api/admin/push/campaign').set(authHeader(admin.token)).send({ title: 't', body: 'b', filter: {} });
    expect(r.status).toBe(400);
  });

  it('campaign agendada: PushCampaign com sentAt null (scheduler dispara)', async () => {
    await reachable({ premium: true });
    const admin = await createAdmin();
    const at = new Date(Date.now() + 3600_000).toISOString();
    const r = await api().post('/api/admin/push/campaign').set(authHeader(admin.token)).send({
      title: 'Amanhã', body: 'b', filter: { plan: 'premium' }, scheduledAt: at,
    });
    expect(r.status).toBe(201);
    expect(r.body.scheduled).toBe(true);
    const camp = await prisma.pushCampaign.findFirst({ where: { title: 'Amanhã' } });
    expect(camp?.sentAt).toBeNull();
    expect(camp?.scheduledAt?.toISOString()).toBe(at);
    // nada disparado ainda
    expect(await prisma.notification.count({ where: { type: 'manual_push' } })).toBe(0);
  });
});
