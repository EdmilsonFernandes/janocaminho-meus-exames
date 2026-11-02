import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { api, authHeader, createUser, createDoctor, resetDb, mintToken } from './helpers';
import { prisma } from '../src/prisma';
import { pickEligibleCampaign, effectiveStatus, validateCtaTarget } from '../src/campaigns/eligibility';
import { saveSettings } from '../src/utils/settings';

async function createAdmin() {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const u = await prisma.user.create({ data: { email: `admin-${Date.now().toString(36)}@exemplo.com`, name: 'Admin Teste', passwordHash, role: 'ADMIN', credits: 0, emailVerified: true } });
  return { id: u.id, token: mintToken(u.id) };
}

const H = 3600_000;
const base = (over: Partial<Parameters<typeof pickEligibleCampaign>[0][number]> = {}) => ({
  id: 'c1', status: 'active', audience: 'patient', startsAt: null, endsAt: null, priority: 0, frequencyHours: 72, maxImpressionsPerUser: 2, createdAt: new Date('2026-01-01'), ...over,
});
const noHistory = () => ({ byCampaign: new Map(), lastImpressionAny: null });

describe('campaigns — regras puras de elegibilidade', () => {
  const now = new Date('2026-11-02T12:00:00Z');

  it('status efetivo: agendada/encerrada pelo calendário, pausada/rascunho/encerrada pelo status', () => {
    expect(effectiveStatus(base({ startsAt: new Date(now.getTime() + H) }), now)).toBe('scheduled');
    expect(effectiveStatus(base({ endsAt: new Date(now.getTime() - H) }), now)).toBe('ended');
    expect(effectiveStatus(base({ status: 'paused' }), now)).toBe('paused');
    expect(effectiveStatus(base({ status: 'draft' }), now)).toBe('draft');
    expect(effectiveStatus(base({ status: 'ended' }), now)).toBe('ended');
    expect(effectiveStatus(base({ startsAt: new Date(now.getTime() - H), endsAt: new Date(now.getTime() + H) }), now)).toBe('active');
  });

  it('só ativa + público certo; rascunho/agendada/pausada/encerrada nunca aparecem', () => {
    const cands = [base({ id: 'draft', status: 'draft' }), base({ id: 'sched', startsAt: new Date(now.getTime() + H) }), base({ id: 'paused', status: 'paused' }), base({ id: 'ended', endsAt: new Date(now.getTime() - 1) }), base({ id: 'doc', audience: 'doctor' })];
    expect(pickEligibleCampaign(cands, noHistory(), { subject: 'patient', globalIntervalHours: 24, now }).campaign).toBeNull();
    const r = pickEligibleCampaign([...cands, base({ id: 'ok' })], noHistory(), { subject: 'patient', globalIntervalHours: 24, now });
    expect(r.campaign?.id).toBe('ok');
    expect(pickEligibleCampaign([base({ id: 'all', audience: 'all' })], noHistory(), { subject: 'doctor', globalIntervalHours: 0, now }).campaign?.id).toBe('all');
  });

  it('frequência: intervalo global, intervalo por campanha e teto de impressões', () => {
    const c = base({ id: 'c1', frequencyHours: 48, maxImpressionsPerUser: 2 });
    // viu QUALQUER campanha há 2h → intervalo global (24h) segura
    let h = { byCampaign: new Map([['other', { count: 1, last: new Date(now.getTime() - 2 * H) }]]), lastImpressionAny: new Date(now.getTime() - 2 * H) };
    expect(pickEligibleCampaign([c], h, { subject: 'patient', globalIntervalHours: 24, now }).reason).toBe('global_interval');
    // viu ESTA há 30h (global ok, mas frequencyHours=48 ainda não passou)
    h = { byCampaign: new Map([['c1', { count: 1, last: new Date(now.getTime() - 30 * H) }]]), lastImpressionAny: new Date(now.getTime() - 30 * H) };
    expect(pickEligibleCampaign([c], h, { subject: 'patient', globalIntervalHours: 24, now }).reason).toBe('all_capped');
    // 49h depois → elegível de novo
    h = { byCampaign: new Map([['c1', { count: 1, last: new Date(now.getTime() - 49 * H) }]]), lastImpressionAny: new Date(now.getTime() - 49 * H) };
    expect(pickEligibleCampaign([c], h, { subject: 'patient', globalIntervalHours: 24, now }).campaign?.id).toBe('c1');
    // teto de 2 impressões atingido → nunca mais
    h = { byCampaign: new Map([['c1', { count: 2, last: new Date(now.getTime() - 500 * H) }]]), lastImpressionAny: new Date(now.getTime() - 500 * H) };
    expect(pickEligibleCampaign([c], h, { subject: 'patient', globalIntervalHours: 24, now }).reason).toBe('all_capped');
  });

  it('concorrência: prioridade > menos vista > termina antes > mais antiga — e sempre UMA', () => {
    const a = base({ id: 'a', priority: 1 });
    const b = base({ id: 'b', priority: 5 });
    const c = base({ id: 'c', priority: 5, endsAt: new Date(now.getTime() + 10 * H) });
    expect(pickEligibleCampaign([a, b, c], noHistory(), { subject: 'patient', globalIntervalHours: 0, now }).campaign?.id).toBe('c');
    const h = { byCampaign: new Map([['c', { count: 1, last: new Date(now.getTime() - 100 * H) }]]), lastImpressionAny: new Date(now.getTime() - 100 * H) };
    expect(pickEligibleCampaign([a, b, c], h, { subject: 'patient', globalIntervalHours: 0, now }).campaign?.id).toBe('b');
  });

  it('destino do botão: interna só /rota; externa só https com host; nada de javascript:', () => {
    expect(validateCtaTarget('none', 'x')).toEqual({ ok: true, value: null });
    expect(validateCtaTarget('internal', '/planos')).toEqual({ ok: true, value: '/planos' });
    expect(validateCtaTarget('internal', '//evil.com').ok).toBe(false);
    expect(validateCtaTarget('internal', 'https://x.com').ok).toBe(false);
    expect(validateCtaTarget('external', 'https://parceiro.com.br/promo?x=1').ok).toBe(true);
    expect(validateCtaTarget('external', 'http://parceiro.com.br').ok).toBe(false);
    expect(validateCtaTarget('external', 'javascript:alert(1)').ok).toBe(false);
    expect(validateCtaTarget('external', 'https://user:pw@x.com').ok).toBe(false);
    expect(validateCtaTarget('external', 'não é url').ok).toBe(false);
  });
});

describe('campaigns — API (admin, paciente, médico)', () => {
  beforeEach(async () => {
    await resetDb();
    await saveSettings('sponsorAds', { enabled: 1, globalIntervalHours: 24, bootDelayMs: 0 });
  });

  async function setup() {
    const admin = await createAdmin();
    const sp = await api().post('/api/admin/sponsors').set(authHeader(admin.token)).send({ name: 'Lab Parceiro', website: 'https://labparceiro.com.br' });
    expect(sp.status).toBe(201);
    const camp = await api().post('/api/admin/campaigns').set(authHeader(admin.token)).send({
      sponsorId: sp.body.id, title: 'Check-up com desconto', description: 'Exames de rotina com condição especial para usuários do Dr. Exame.',
      ctaLabel: 'Ver oferta', ctaType: 'external', ctaTarget: 'https://labparceiro.com.br/drexame', audience: 'patient', priority: 1, frequencyHours: 48, maxImpressionsPerUser: 2,
    });
    expect(camp.status).toBe(201);
    expect(camp.body.status).toBe('draft');
    return { admin, sponsor: sp.body, campaign: camp.body };
  }

  it('não-admin é bloqueado (403) nas rotas de gestão', async () => {
    const u = await createUser();
    expect((await api().get('/api/admin/campaigns').set(authHeader(u.token))).status).toBe(403);
    expect((await api().post('/api/admin/sponsors').set(authHeader(u.token)).send({ name: 'x' })).status).toBe(403);
    expect((await api().get('/api/admin/campaigns')).status).toBe(401);
  });

  it('rascunho não aparece; publicar → aparece; pausar → some; encerrar → some e não volta', async () => {
    const { admin, campaign } = await setup();
    const u = await createUser();
    const A = authHeader(admin.token);

    let r = await api().get('/api/campaigns/eligible').set(authHeader(u.token));
    expect(r.status).toBe(200); expect(r.body.campaign).toBeNull();

    r = await api().post(`/api/admin/campaigns/${campaign.id}/publish`).set(A);
    expect(r.status).toBe(200); expect(r.body.effectiveStatus).toBe('active');

    r = await api().get('/api/campaigns/eligible').set(authHeader(u.token));
    expect(r.body.campaign?.id).toBe(campaign.id);
    expect(r.body.campaign.sponsor.name).toBe('Lab Parceiro');
    expect(r.body.campaign.ctaTarget).toBe('https://labparceiro.com.br/drexame');

    r = await api().post(`/api/admin/campaigns/${campaign.id}/pause`).set(A);
    expect(r.body.effectiveStatus).toBe('paused');
    r = await api().get('/api/campaigns/eligible').set(authHeader(u.token));
    expect(r.body.campaign).toBeNull();

    r = await api().post(`/api/admin/campaigns/${campaign.id}/publish`).set(A); // retomar
    expect(r.body.effectiveStatus).toBe('active');

    r = await api().post(`/api/admin/campaigns/${campaign.id}/end`).set(A);
    expect(r.body.effectiveStatus).toBe('ended');
    r = await api().get('/api/campaigns/eligible').set(authHeader(u.token));
    expect(r.body.campaign).toBeNull();
    r = await api().post(`/api/admin/campaigns/${campaign.id}/publish`).set(A);
    expect(r.status).toBe(409);
    r = await api().patch(`/api/admin/campaigns/${campaign.id}`).set(A).send({ title: 'novo' });
    expect(r.status).toBe(409);
  });

  it('agendada (startsAt futuro) e encerrada pelo calendário (endsAt passado) não aparecem', async () => {
    const { admin, campaign } = await setup();
    const u = await createUser();
    const A = authHeader(admin.token);
    let r = await api().patch(`/api/admin/campaigns/${campaign.id}`).set(A).send({ startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(r.status).toBe(200);
    await api().post(`/api/admin/campaigns/${campaign.id}/publish`).set(A);
    r = await api().get('/api/admin/campaigns').set(A);
    expect(r.body.campaigns[0].effectiveStatus).toBe('scheduled');
    expect((await api().get('/api/campaigns/eligible').set(authHeader(u.token))).body.campaign).toBeNull();

    r = await api().patch(`/api/admin/campaigns/${campaign.id}`).set(A).send({ startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), endsAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(r.status).toBe(200);
    expect((await api().get('/api/admin/campaigns').set(A)).body.campaigns[0].effectiveStatus).toBe('ended');
    expect((await api().get('/api/campaigns/eligible').set(authHeader(u.token))).body.campaign).toBeNull();
    // janela invertida é rejeitada
    r = await api().patch(`/api/admin/campaigns/${campaign.id}`).set(A).send({ startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date().toISOString() });
    expect(r.status).toBe(400);
  });

  it('eventos: impressão/clique/dispensa idempotentes por impressionId; métricas e CTR corretos; frequência persiste no servidor', async () => {
    const { admin, campaign } = await setup();
    const u = await createUser();
    const A = authHeader(admin.token);
    await api().post(`/api/admin/campaigns/${campaign.id}/publish`).set(A);

    const impressionId = 'imp-0001-abcdef';
    let r = await api().post(`/api/campaigns/${campaign.id}/events`).set(authHeader(u.token)).send({ type: 'impression', impressionId, platform: 'android', appVersion: '2.7.311' });
    expect(r.status).toBe(201);
    r = await api().post(`/api/campaigns/${campaign.id}/events`).set(authHeader(u.token)).send({ type: 'impression', impressionId });
    expect(r.status).toBe(200); expect(r.body.duplicate).toBe(true);
    r = await api().post(`/api/campaigns/${campaign.id}/events`).set(authHeader(u.token)).send({ type: 'click', impressionId });
    expect(r.status).toBe(201);
    r = await api().post(`/api/campaigns/${campaign.id}/events`).set(authHeader(u.token)).send({ type: 'click', impressionId });
    expect(r.body.duplicate).toBe(true);
    expect((await api().post(`/api/campaigns/${campaign.id}/events`).set(authHeader(u.token)).send({ type: 'bogus', impressionId })).status).toBe(400);

    // mesma campanha NÃO volta pro mesmo usuário (intervalo 48h) — reload/outro aparelho dá no mesmo (server-side)
    r = await api().get('/api/campaigns/eligible').set(authHeader(u.token));
    expect(r.body.campaign).toBeNull();
    // outro usuário ainda vê
    const u2 = await createUser();
    expect((await api().get('/api/campaigns/eligible').set(authHeader(u2.token))).body.campaign?.id).toBe(campaign.id);

    r = await api().get(`/api/admin/campaigns/${campaign.id}/metrics`).set(A);
    expect(r.body.totals).toMatchObject({ impressions: 1, reach: 1, clicks: 1, dismisses: 0, ctr: 100 });
    expect(r.body.byPlatform.android.impressions).toBe(1);

    const list = await api().get('/api/admin/campaigns').set(A);
    expect(list.body.campaigns[0].metrics).toMatchObject({ impressions: 1, clicks: 1, ctr: 100 });
  });

  it('várias ativas → só a de maior prioridade; kill-switch global desliga tudo', async () => {
    const { admin, sponsor, campaign } = await setup();
    const A = authHeader(admin.token);
    const u = await createUser();
    const c2 = await api().post('/api/admin/campaigns').set(A).send({ sponsorId: sponsor.id, title: 'Prioritária', description: 'Campanha com prioridade maior para teste de concorrência.', ctaType: 'internal', ctaTarget: '/planos', priority: 9 });
    await api().post(`/api/admin/campaigns/${campaign.id}/publish`).set(A);
    await api().post(`/api/admin/campaigns/${c2.body.id}/publish`).set(A);
    let r = await api().get('/api/campaigns/eligible').set(authHeader(u.token));
    expect(r.body.campaign?.id).toBe(c2.body.id);
    expect(r.body.campaign.ctaType).toBe('internal');

    await saveSettings('sponsorAds', { enabled: 0 });
    r = await api().get('/api/campaigns/eligible').set(authHeader(u.token));
    expect(r.body.campaign).toBeNull(); expect(r.body.reason).toBe('disabled');
  });

  it('público: campanha "doctor" aparece pro médico (não pro paciente) e eventos do médico ficam separados', async () => {
    const { admin, sponsor } = await setup();
    const A = authHeader(admin.token);
    const c = await api().post('/api/admin/campaigns').set(A).send({ sponsorId: sponsor.id, title: 'Para médicos', description: 'Campanha dirigida exclusivamente ao portal do médico.', ctaType: 'none', audience: 'doctor' });
    await api().post(`/api/admin/campaigns/${c.body.id}/publish`).set(A);
    const u = await createUser();
    expect((await api().get('/api/campaigns/eligible').set(authHeader(u.token))).body.campaign).toBeNull();
    const d = await createDoctor({ crm: '55555-SP' });
    const r = await api().get('/api/doctor/campaigns/eligible').set(authHeader(d.token));
    expect(r.body.campaign?.id).toBe(c.body.id);
    expect((await api().post(`/api/doctor/campaigns/${c.body.id}/events`).set(authHeader(d.token)).send({ type: 'impression', impressionId: 'doc-imp-00001' })).status).toBe(201);
    const ev = await prisma.sponsorCampaignEvent.findFirst({ where: { campaignId: c.body.id } });
    expect(ev?.subjectKey).toBe(`d:${d.doctor.id}`);
    // token de paciente não vale no espelho do médico
    expect((await api().get('/api/doctor/campaigns/eligible').set(authHeader(u.token))).status).toBe(401);
  });

  it('validação: URL externa http/javascript rejeitada; patrocinador inativo não publica; só rascunho pode ser excluído', async () => {
    const { admin, sponsor, campaign } = await setup();
    const A = authHeader(admin.token);
    let r = await api().post('/api/admin/campaigns').set(A).send({ sponsorId: sponsor.id, title: 'Ruim', description: 'Descrição suficiente para passar no mínimo.', ctaType: 'external', ctaTarget: 'javascript:alert(1)' });
    expect(r.status).toBe(400);
    r = await api().post('/api/admin/campaigns').set(A).send({ sponsorId: sponsor.id, title: 'Ruim', description: 'Descrição suficiente para passar no mínimo.', ctaType: 'external', ctaTarget: 'http://inseguro.com' });
    expect(r.status).toBe(400);
    r = await api().post('/api/admin/campaigns').set(A).send({ sponsorId: sponsor.id, title: 'Ruim', description: 'Descrição suficiente para passar no mínimo.', ctaType: 'internal', ctaTarget: 'https://x.com' });
    expect(r.status).toBe(400);

    await api().patch(`/api/admin/sponsors/${sponsor.id}`).set(A).send({ active: false });
    r = await api().post(`/api/admin/campaigns/${campaign.id}/publish`).set(A);
    expect(r.status).toBe(409);
    await api().patch(`/api/admin/sponsors/${sponsor.id}`).set(A).send({ active: true });

    expect((await api().delete(`/api/admin/campaigns/${campaign.id}`).set(A)).status).toBe(200);
    expect((await api().get('/api/admin/campaigns').set(A)).body.campaigns).toHaveLength(0);
  });

  it('falha no serviço de campanhas não bloqueia: eligible devolve null com 200 mesmo sem tabela válida', async () => {
    const u = await createUser();
    // simula erro de banco na consulta (ex.: migration ainda não aplicada) — o handler engole e devolve null
    const orig = prisma.sponsorCampaign.findMany;
    (prisma.sponsorCampaign as any).findMany = async () => { throw new Error('relation "sponsor_campaigns" does not exist'); };
    try {
      const r = await api().get('/api/campaigns/eligible').set(authHeader(u.token));
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ campaign: null, reason: 'error' });
    } finally {
      (prisma.sponsorCampaign as any).findMany = orig;
    }
  });
});
