import { Router, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import { prisma } from '../prisma';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { requireAdmin } from './admin.routes';
import { requireDoctorOnboarding } from './doctor.routes';
import { upload } from '../middleware/upload';
import { audit } from '../utils/audit';
import { getSettings } from '../utils/settings';
import { saveSponsorAsset, resolvePatientPhoto } from '../utils/storage';
import {
  pickEligibleCampaign, effectiveStatus, validateCtaTarget, AUDIENCES, CTA_TYPES,
  type SubjectHistory, type SubjectKind, type CampaignStatus,
} from '../campaigns/eligibility';

/**
 * PATROCINADORES & CAMPANHAS (02/11/26)
 *
 *  /api/campaigns              (paciente, requireAuth)  GET /eligible · POST /:id/events
 *  /api/campaigns/sponsor/:id/logo · /api/campaigns/:id/image   (públicos, cacheáveis)
 *  /api/doctor/campaigns/*     (médico, requireDoctorOnboarding) — espelho do paciente
 *  /api/admin/sponsors, /api/admin/campaigns   (admin) — CRUD, estados, upload, métricas
 *
 * Nunca segmenta por dado clínico. Falha aqui NUNCA derruba o app: o front trata 5xx
 * como "sem campanha". A prévia do admin não passa por aqui (não conta impressão).
 */

const EVENT_TYPES = new Set(['impression', 'click', 'dismiss']);
const PLATFORMS = new Set(['web', 'android', 'ios']);

const settingsOf = () => {
  const s: any = (getSettings() as any).sponsorAds ?? {};
  return {
    enabled: s.enabled === true || Number(s.enabled) === 1,
    globalIntervalHours: Number(s.globalIntervalHours) >= 0 ? Number(s.globalIntervalHours) : 24,
    bootDelayMs: Number(s.bootDelayMs) >= 0 ? Number(s.bootDelayMs) : 3500,
  };
};

/** Versão curta p/ bustar cache de imagem (ref muda a cada upload — sufixo timestamp). */
const assetVersion = (ref: string | null) => (ref ? ref.slice(-12).replace(/[^A-Za-z0-9]/g, '') : '');

const serializeForClient = (c: any) => ({
  id: c.id,
  title: c.title,
  description: c.description,
  ctaLabel: c.ctaLabel,
  ctaType: c.ctaType,
  ctaTarget: c.ctaTarget,
  imageUrl: c.imageUrl ? `/campaigns/${c.id}/image?v=${assetVersion(c.imageUrl)}` : null,
  sponsor: {
    id: c.sponsor.id,
    name: c.sponsor.name,
    logoUrl: c.sponsor.logoUrl ? `/campaigns/sponsor/${c.sponsor.id}/logo?v=${assetVersion(c.sponsor.logoUrl)}` : null,
  },
});

async function historyFor(subjectKey: string, campaignIds: string[]): Promise<SubjectHistory> {
  const byCampaign = new Map<string, { count: number; last: Date | null }>();
  let lastImpressionAny: Date | null = null;
  if (campaignIds.length === 0) return { byCampaign, lastImpressionAny };
  const rows = await prisma.sponsorCampaignEvent.findMany({
    where: { subjectKey, type: 'impression' },
    select: { campaignId: true, createdAt: true },
  });
  for (const r of rows) {
    const h = byCampaign.get(r.campaignId) ?? { count: 0, last: null };
    h.count += 1;
    if (!h.last || r.createdAt > h.last) h.last = r.createdAt;
    byCampaign.set(r.campaignId, h);
    if (!lastImpressionAny || r.createdAt > lastImpressionAny) lastImpressionAny = r.createdAt;
  }
  return { byCampaign, lastImpressionAny };
}

/** GET eligible — UMA campanha (ou null). Nunca lança pro cliente: erro → { campaign: null }. */
async function eligibleHandler(subject: SubjectKind, subjectKey: string, res: Response): Promise<void> {
  try {
    const s = settingsOf();
    if (!s.enabled) { res.json({ campaign: null, reason: 'disabled' }); return; }
    const candidates = await prisma.sponsorCampaign.findMany({
      where: { status: { in: ['active', 'scheduled'] }, sponsor: { active: true } },
      include: { sponsor: { select: { id: true, name: true, logoUrl: true } } },
    });
    const history = await historyFor(subjectKey, candidates.map((c) => c.id));
    const pick = pickEligibleCampaign(candidates, history, { subject, globalIntervalHours: s.globalIntervalHours });
    res.json({ campaign: pick.campaign ? serializeForClient(pick.campaign) : null, reason: pick.reason });
  } catch (e) {
    console.error('[campaigns] eligible falhou (sem campanha):', (e as Error).message);
    res.json({ campaign: null, reason: 'error' });
  }
}

/** POST events — idempotente por (campaignId, type, impressionId). Duplicado = 200 {duplicate:true}. */
async function eventHandler(subjectKey: string, req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campaignId = String(req.params.id);
    const type = String(req.body?.type ?? '');
    const impressionId = String(req.body?.impressionId ?? '').trim();
    if (!EVENT_TYPES.has(type)) { res.status(400).json({ error: 'Tipo de evento inválido.' }); return; }
    if (impressionId.length < 8 || impressionId.length > 64 || !/^[A-Za-z0-9\-_]+$/.test(impressionId)) { res.status(400).json({ error: 'impressionId inválido.' }); return; }
    const platformRaw = String(req.body?.platform ?? '').toLowerCase();
    const platform = PLATFORMS.has(platformRaw) ? platformRaw : null;
    const appVersion = typeof req.body?.appVersion === 'string' ? req.body.appVersion.slice(0, 32) : null;
    const exists = await prisma.sponsorCampaign.findUnique({ where: { id: campaignId }, select: { id: true } });
    if (!exists) { res.status(404).json({ error: 'Campanha não encontrada.' }); return; }
    try {
      await prisma.sponsorCampaignEvent.create({ data: { campaignId, subjectKey, type, impressionId, platform, appVersion } });
      res.status(201).json({ ok: true });
    } catch (e: any) {
      if (e?.code === 'P2002') { res.json({ ok: true, duplicate: true }); return; }
      throw e;
    }
  } catch (e) { next(e); }
}

async function serveAsset(ref: string | null | undefined, res: Response): Promise<void> {
  if (!ref) { res.status(404).end(); return; }
  const r = await resolvePatientPhoto(ref);
  if (r.kind === 'url') { res.redirect(r.url); return; }
  if (fs.existsSync(r.file)) { res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); res.sendFile(r.file); return; }
  res.status(404).end();
}

// ───────────────────────── PACIENTE (/api/campaigns) ─────────────────────────
const router = Router();

// Assets PÚBLICOS (logo/imagem não são dado sensível) — antes do requireAuth.
router.get('/sponsor/:id/logo', async (req, res, next) => {
  try {
    const s = await prisma.sponsor.findUnique({ where: { id: String(req.params.id) }, select: { logoUrl: true } });
    await serveAsset(s?.logoUrl, res);
  } catch (e) { next(e); }
});
router.get('/:id/image', async (req, res, next) => {
  try {
    const c = await prisma.sponsorCampaign.findUnique({ where: { id: String(req.params.id) }, select: { imageUrl: true } });
    await serveAsset(c?.imageUrl, res);
  } catch (e) { next(e); }
});

router.use(requireAuth);
router.get('/eligible', (req: AuthedRequest, res) => eligibleHandler('patient', `u:${req.userId}`, res));
router.post('/:id/events', (req: AuthedRequest, res, next) => eventHandler(`u:${req.userId}`, req, res, next));

// ───────────────────────── MÉDICO (/api/doctor/campaigns) ─────────────────────────
export const doctorRouter = Router();
doctorRouter.get('/campaigns/eligible', requireDoctorOnboarding, (req: any, res) => eligibleHandler('doctor', `d:${req.doctorId}`, res));
doctorRouter.post('/campaigns/:id/events', requireDoctorOnboarding, (req: any, res, next) => eventHandler(`d:${req.doctorId}`, req, res, next));

// ───────────────────────── ADMIN (/api/admin/sponsors | /api/admin/campaigns) ─────────────────────────
export const adminRouter = Router();
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optDate = (v: unknown): Date | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

interface CampaignMetrics { impressions: number; reach: number; clicks: number; dismisses: number; ctr: number }

/** CTR = impressões com clique ÷ impressões efetivas. O índice único (campaignId, type,
 *  impressionId) garante 1 clique por impressão → count(click) já é "impressões clicadas". */
async function metricsFor(campaignIds: string[]): Promise<Map<string, CampaignMetrics>> {
  const out = new Map<string, CampaignMetrics>();
  for (const id of campaignIds) out.set(id, { impressions: 0, reach: 0, clicks: 0, dismisses: 0, ctr: 0 });
  if (campaignIds.length === 0) return out;
  const grouped = await prisma.sponsorCampaignEvent.groupBy({
    by: ['campaignId', 'type'],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  for (const g of grouped) {
    const m = out.get(g.campaignId)!;
    if (g.type === 'impression') m.impressions = g._count._all;
    else if (g.type === 'click') m.clicks = g._count._all;
    else if (g.type === 'dismiss') m.dismisses = g._count._all;
  }
  const reachRows = await prisma.sponsorCampaignEvent.findMany({
    where: { campaignId: { in: campaignIds }, type: 'impression' },
    distinct: ['campaignId', 'subjectKey'],
    select: { campaignId: true },
  });
  for (const r of reachRows) out.get(r.campaignId)!.reach += 1;
  for (const m of out.values()) m.ctr = m.impressions > 0 ? Math.round((m.clicks / m.impressions) * 1000) / 10 : 0;
  return out;
}

const serializeAdmin = (c: any, metrics?: CampaignMetrics, now = new Date()) => ({
  id: c.id,
  sponsorId: c.sponsorId,
  sponsor: c.sponsor ? { id: c.sponsor.id, name: c.sponsor.name, active: c.sponsor.active, logoUrl: c.sponsor.logoUrl ? `/campaigns/sponsor/${c.sponsor.id}/logo?v=${assetVersion(c.sponsor.logoUrl)}` : null } : undefined,
  title: c.title,
  description: c.description,
  imageUrl: c.imageUrl ? `/campaigns/${c.id}/image?v=${assetVersion(c.imageUrl)}` : null,
  ctaLabel: c.ctaLabel,
  ctaType: c.ctaType,
  ctaTarget: c.ctaTarget,
  audience: c.audience,
  status: c.status,
  effectiveStatus: effectiveStatus(c, now),
  startsAt: c.startsAt,
  endsAt: c.endsAt,
  priority: c.priority,
  frequencyHours: c.frequencyHours,
  maxImpressionsPerUser: c.maxImpressionsPerUser,
  publishedAt: c.publishedAt,
  endedAt: c.endedAt,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  metrics: metrics ?? null,
});

const serializeSponsor = (s: any) => ({
  id: s.id, name: s.name, website: s.website, notes: s.notes, active: s.active,
  logoUrl: s.logoUrl ? `/campaigns/sponsor/${s.id}/logo?v=${assetVersion(s.logoUrl)}` : null,
  campaignCount: s._count?.campaigns ?? undefined,
  createdAt: s.createdAt,
});

/** Valida/normaliza o corpo de criação/edição de campanha. Campos ausentes ficam undefined (PATCH parcial). */
function parseCampaignBody(body: any, partial: boolean): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const data: Record<string, unknown> = {};
  const has = (k: string) => body && body[k] !== undefined;
  if (has('sponsorId') || !partial) {
    const sponsorId = str(body?.sponsorId, 64);
    if (!sponsorId) return { ok: false, error: 'Escolha o patrocinador.' };
    data.sponsorId = sponsorId;
  }
  if (has('title') || !partial) {
    const title = str(body?.title, 60);
    if (title.length < 3) return { ok: false, error: 'Título: mínimo 3 caracteres (máx. 60).' };
    data.title = title;
  }
  if (has('description') || !partial) {
    const description = str(body?.description, 220);
    if (description.length < 10) return { ok: false, error: 'Descrição: mínimo 10 caracteres (máx. 220).' };
    data.description = description;
  }
  if (has('ctaLabel')) {
    const ctaLabel = str(body?.ctaLabel, 24) || 'Saiba mais';
    data.ctaLabel = ctaLabel;
  }
  if (has('ctaType') || has('ctaTarget') || !partial) {
    const ctaType = str(body?.ctaType, 16) || 'none';
    if (!CTA_TYPES.includes(ctaType as any)) return { ok: false, error: 'Tipo de destino inválido.' };
    const v = validateCtaTarget(ctaType, body?.ctaTarget);
    if (!v.ok) return { ok: false, error: v.error };
    data.ctaType = ctaType;
    data.ctaTarget = v.value;
  }
  if (has('audience') || !partial) {
    const audience = str(body?.audience, 16) || 'patient';
    if (!AUDIENCES.includes(audience as any)) return { ok: false, error: 'Público inválido (patient | doctor | all).' };
    data.audience = audience;
  }
  if (has('startsAt')) { const d = optDate(body.startsAt); if (d === undefined) return { ok: false, error: 'Data de início inválida.' }; data.startsAt = d; }
  if (has('endsAt')) { const d = optDate(body.endsAt); if (d === undefined) return { ok: false, error: 'Data de término inválida.' }; data.endsAt = d; }
  if (has('priority')) { const n = Number(body.priority); if (!Number.isInteger(n) || n < 0 || n > 1000) return { ok: false, error: 'Prioridade: inteiro de 0 a 1000.' }; data.priority = n; }
  if (has('frequencyHours')) { const n = Number(body.frequencyHours); if (!Number.isInteger(n) || n < 0 || n > 24 * 365) return { ok: false, error: 'Intervalo (horas): inteiro de 0 a 8760.' }; data.frequencyHours = n; }
  if (has('maxImpressionsPerUser')) { const n = Number(body.maxImpressionsPerUser); if (!Number.isInteger(n) || n < 0 || n > 1000) return { ok: false, error: 'Máx. de exibições por usuário: inteiro de 0 (sem limite) a 1000.' }; data.maxImpressionsPerUser = n; }
  const s = data.startsAt as Date | null | undefined; const e = data.endsAt as Date | null | undefined;
  if (s && e && e.getTime() <= s.getTime()) return { ok: false, error: 'O término precisa ser depois do início.' };
  return { ok: true, data };
}

// ── Patrocinadores ──
adminRouter.get('/sponsors', async (_req, res, next) => {
  try {
    const rows = await prisma.sponsor.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { campaigns: true } } } });
    res.json({ sponsors: rows.map(serializeSponsor) });
  } catch (e) { next(e); }
});

adminRouter.post('/sponsors', async (req: AuthedRequest, res, next) => {
  try {
    const name = str(req.body?.name, 80);
    if (name.length < 2) { res.status(400).json({ error: 'Nome do patrocinador: mínimo 2 caracteres.' }); return; }
    const website = str(req.body?.website, 300);
    if (website) { const v = validateCtaTarget('external', website); if (!v.ok) { res.status(400).json({ error: `Site: ${v.error}` }); return; } }
    const s = await prisma.sponsor.create({ data: { name, website: website || null, notes: str(req.body?.notes, 500) || null, active: req.body?.active === undefined ? true : !!req.body.active } });
    await audit('SPONSOR_CREATED', req, { targetType: 'SPONSOR', targetId: s.id, after: { name } });
    res.status(201).json(serializeSponsor(s));
  } catch (e) { next(e); }
});

adminRouter.patch('/sponsors/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const before = await prisma.sponsor.findUnique({ where: { id } });
    if (!before) { res.status(404).json({ error: 'Patrocinador não encontrado.' }); return; }
    const data: Record<string, unknown> = {};
    if (req.body?.name !== undefined) { const name = str(req.body.name, 80); if (name.length < 2) { res.status(400).json({ error: 'Nome: mínimo 2 caracteres.' }); return; } data.name = name; }
    if (req.body?.website !== undefined) {
      const website = str(req.body.website, 300);
      if (website) { const v = validateCtaTarget('external', website); if (!v.ok) { res.status(400).json({ error: `Site: ${v.error}` }); return; } }
      data.website = website || null;
    }
    if (req.body?.notes !== undefined) data.notes = str(req.body.notes, 500) || null;
    if (req.body?.active !== undefined) data.active = !!req.body.active;
    const s = await prisma.sponsor.update({ where: { id }, data });
    await audit('SPONSOR_UPDATED', req, { targetType: 'SPONSOR', targetId: id, before: { name: before.name, active: before.active }, after: data });
    res.json(serializeSponsor(s));
  } catch (e) { next(e); }
});

adminRouter.post('/sponsors/:id/logo', upload.single('logo'), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const file = (req as any).file as { buffer: Buffer; mimetype: string } | undefined;
    if (!file || !/^image\//.test(file.mimetype)) { res.status(400).json({ error: 'Envie uma imagem JPG ou PNG.' }); return; }
    const s = await prisma.sponsor.findUnique({ where: { id }, select: { id: true } });
    if (!s) { res.status(404).json({ error: 'Patrocinador não encontrado.' }); return; }
    const ref = await saveSponsorAsset('sponsor-logo', id, file.buffer);
    const updated = await prisma.sponsor.update({ where: { id }, data: { logoUrl: ref } });
    res.json(serializeSponsor(updated));
  } catch (e) { next(e); }
});

// ── Campanhas ──
adminRouter.get('/campaigns', async (_req, res, next) => {
  try {
    const rows = await prisma.sponsorCampaign.findMany({ orderBy: [{ createdAt: 'desc' }], include: { sponsor: { select: { id: true, name: true, active: true, logoUrl: true } } } });
    const metrics = await metricsFor(rows.map((r) => r.id));
    const now = new Date();
    res.json({ campaigns: rows.map((c) => serializeAdmin(c, metrics.get(c.id), now)), settings: settingsOf() });
  } catch (e) { next(e); }
});

adminRouter.post('/campaigns', async (req: AuthedRequest, res, next) => {
  try {
    const parsed = parseCampaignBody(req.body, false);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const sponsor = await prisma.sponsor.findUnique({ where: { id: String(parsed.data.sponsorId) }, select: { id: true } });
    if (!sponsor) { res.status(400).json({ error: 'Patrocinador não encontrado.' }); return; }
    const c = await prisma.sponsorCampaign.create({
      data: { ...(parsed.data as any), status: 'draft', createdBy: req.userId ?? null },
      include: { sponsor: { select: { id: true, name: true, active: true, logoUrl: true } } },
    });
    await audit('CAMPAIGN_CREATED', req, { targetType: 'CAMPAIGN', targetId: c.id, after: { title: c.title, sponsorId: c.sponsorId } });
    res.status(201).json(serializeAdmin(c));
  } catch (e) { next(e); }
});

adminRouter.patch('/campaigns/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const before = await prisma.sponsorCampaign.findUnique({ where: { id } });
    if (!before) { res.status(404).json({ error: 'Campanha não encontrada.' }); return; }
    if (before.status === 'ended') { res.status(409).json({ error: 'Campanha encerrada não pode ser editada. Crie uma nova.' }); return; }
    const parsed = parseCampaignBody(req.body, true);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    // janela consistente com o que já está gravado
    const s = (parsed.data.startsAt === undefined ? before.startsAt : parsed.data.startsAt) as Date | null;
    const e = (parsed.data.endsAt === undefined ? before.endsAt : parsed.data.endsAt) as Date | null;
    if (s && e && e.getTime() <= s.getTime()) { res.status(400).json({ error: 'O término precisa ser depois do início.' }); return; }
    if (parsed.data.sponsorId) {
      const sponsor = await prisma.sponsor.findUnique({ where: { id: String(parsed.data.sponsorId) }, select: { id: true } });
      if (!sponsor) { res.status(400).json({ error: 'Patrocinador não encontrado.' }); return; }
    }
    const c = await prisma.sponsorCampaign.update({ where: { id }, data: parsed.data as any, include: { sponsor: { select: { id: true, name: true, active: true, logoUrl: true } } } });
    await audit('CAMPAIGN_UPDATED', req, { targetType: 'CAMPAIGN', targetId: id, before: { title: before.title, ctaTarget: before.ctaTarget, startsAt: before.startsAt, endsAt: before.endsAt }, after: parsed.data });
    const metrics = await metricsFor([id]);
    res.json(serializeAdmin(c, metrics.get(id)));
  } catch (e) { next(e); }
});

adminRouter.post('/campaigns/:id/image', upload.single('image'), async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const file = (req as any).file as { buffer: Buffer; mimetype: string } | undefined;
    if (!file || !/^image\//.test(file.mimetype)) { res.status(400).json({ error: 'Envie uma imagem JPG ou PNG.' }); return; }
    const c = await prisma.sponsorCampaign.findUnique({ where: { id }, select: { id: true } });
    if (!c) { res.status(404).json({ error: 'Campanha não encontrada.' }); return; }
    const ref = await saveSponsorAsset('campaign-image', id, file.buffer);
    const updated = await prisma.sponsorCampaign.update({ where: { id }, data: { imageUrl: ref }, include: { sponsor: { select: { id: true, name: true, active: true, logoUrl: true } } } });
    res.json(serializeAdmin(updated));
  } catch (e) { next(e); }
});

/** Transições: draft/paused → active (publish/resume); active/scheduled → paused; qualquer → ended. */
async function transition(req: AuthedRequest, res: Response, next: NextFunction, action: 'publish' | 'pause' | 'end'): Promise<void> {
  try {
    const id = String(req.params.id);
    const c = await prisma.sponsorCampaign.findUnique({ where: { id }, include: { sponsor: { select: { id: true, name: true, active: true, logoUrl: true } } } });
    if (!c) { res.status(404).json({ error: 'Campanha não encontrada.' }); return; }
    const now = new Date();
    const cur = effectiveStatus(c, now);
    let data: Record<string, unknown>;
    if (action === 'publish') {
      if (cur === 'ended') { res.status(409).json({ error: 'Campanha encerrada não pode ser publicada de novo.' }); return; }
      if (cur === 'active' || cur === 'scheduled') { res.status(409).json({ error: 'Campanha já está publicada.' }); return; }
      if (!c.sponsor.active) { res.status(409).json({ error: 'Patrocinador inativo: ative-o antes de publicar.' }); return; }
      const v = validateCtaTarget(c.ctaType, c.ctaTarget);
      if (!v.ok) { res.status(400).json({ error: `Destino do botão: ${v.error}` }); return; }
      data = { status: 'active', publishedAt: c.publishedAt ?? now };
    } else if (action === 'pause') {
      if (cur !== 'active' && cur !== 'scheduled') { res.status(409).json({ error: 'Só campanhas publicadas podem ser pausadas.' }); return; }
      data = { status: 'paused' };
    } else {
      if (cur === 'ended' && c.status === 'ended') { res.status(409).json({ error: 'Campanha já encerrada.' }); return; }
      data = { status: 'ended', endedAt: now };
    }
    const updated = await prisma.sponsorCampaign.update({ where: { id }, data, include: { sponsor: { select: { id: true, name: true, active: true, logoUrl: true } } } });
    await audit(`CAMPAIGN_${action.toUpperCase()}`, req, { targetType: 'CAMPAIGN', targetId: id, before: { status: c.status }, after: { status: updated.status } });
    const metrics = await metricsFor([id]);
    res.json(serializeAdmin(updated, metrics.get(id), now));
  } catch (e) { next(e); }
}
adminRouter.post('/campaigns/:id/publish', (req: AuthedRequest, res, next) => transition(req, res, next, 'publish'));
adminRouter.post('/campaigns/:id/pause', (req: AuthedRequest, res, next) => transition(req, res, next, 'pause'));
adminRouter.post('/campaigns/:id/end', (req: AuthedRequest, res, next) => transition(req, res, next, 'end'));

adminRouter.delete('/campaigns/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const c = await prisma.sponsorCampaign.findUnique({ where: { id }, select: { status: true, title: true } });
    if (!c) { res.status(404).json({ error: 'Campanha não encontrada.' }); return; }
    if (c.status !== 'draft') { res.status(409).json({ error: 'Só rascunhos podem ser excluídos — encerre a campanha para manter o histórico.' }); return; }
    await prisma.sponsorCampaign.delete({ where: { id } });
    await audit('CAMPAIGN_DELETED', req, { targetType: 'CAMPAIGN', targetId: id, before: { title: c.title } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Métricas detalhadas: totais + série diária (30d) + por plataforma. */
adminRouter.get('/campaigns/:id/metrics', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const c = await prisma.sponsorCampaign.findUnique({ where: { id }, select: { id: true } });
    if (!c) { res.status(404).json({ error: 'Campanha não encontrada.' }); return; }
    const totals = (await metricsFor([id])).get(id)!;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await prisma.sponsorCampaignEvent.findMany({ where: { campaignId: id, createdAt: { gte: since } }, select: { type: true, createdAt: true, platform: true } });
    const daily = new Map<string, { impressions: number; clicks: number; dismisses: number }>();
    const byPlatform: Record<string, { impressions: number; clicks: number }> = {};
    for (const r of rows) {
      const day = r.createdAt.toISOString().slice(0, 10);
      const d = daily.get(day) ?? { impressions: 0, clicks: 0, dismisses: 0 };
      if (r.type === 'impression') d.impressions++; else if (r.type === 'click') d.clicks++; else d.dismisses++;
      daily.set(day, d);
      const p = r.platform ?? 'desconhecida';
      byPlatform[p] = byPlatform[p] ?? { impressions: 0, clicks: 0 };
      if (r.type === 'impression') byPlatform[p].impressions++; else if (r.type === 'click') byPlatform[p].clicks++;
    }
    res.json({
      totals,
      ctrDefinition: 'CTR = impressões com clique ÷ impressões efetivas (1 clique por impressão; prévia do admin não conta).',
      daily: Array.from(daily.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
      byPlatform,
    });
  } catch (e) { next(e); }
});

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = { draft: 'Rascunho', scheduled: 'Agendada', active: 'Ativa', paused: 'Pausada', ended: 'Encerrada' };

export default router;
