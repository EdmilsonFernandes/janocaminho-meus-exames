import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { getSettings, saveSettings, getMonthlyPlan, type SettingCategory } from '../utils/settings';
import { deleteExamFile, saveExamFile, resolveExamFile, saveLabLogo } from '../utils/storage';
import { invalidateLabsCache, slugify } from './labs.routes';
import { listBlockedDomains, addBlockedDomain, removeBlockedDomain, syncBlockedDomains } from '../utils/blockedDomains';
import { sendPush, sendPushToUser, PUSH_TOPIC } from '../utils/push';
import { sendEmail } from '../utils/mailer';
import { ticketReplyEmail, webUrl } from '../utils/emailTemplate';
import { upload } from '../middleware/upload';
import { audit } from '../utils/audit';
import { logCredit } from '../utils/credits';
import { getConfigRows, getActiveProvider, AI_PROVIDERS, resolveProviderConfig, type AiProviderName } from '../llm/ai-config';
import { refreshLlm, testLlmConnection } from '../llm';
import { generateExplanation } from '../analysis/explain';
import { encryptPII } from '../utils/crypto';
import { cpfFingerprint, maskStoredCpf, revealStoredCpf } from '../utils/cpf';
import { getSubscriptionColumnSupport } from '../utils/subscriptionCompat';

const router = Router();
router.use(requireAuth);

// Middleware: só admin (role = ADMIN)
const requireAdmin = async (req: AuthedRequest, res: any, next: any) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } });
  if (!u || u.role !== 'ADMIN') { res.status(403).json({ error: 'Acesso restrito a administradores.' }); return; }
  next();
};
router.use(requireAdmin);

const maskEmail = (value: string) => {
  const [name, domain] = String(value).split('@');
  if (!name || !domain) return '***';
  return `${name.slice(0, 1)}***@${domain}`;
};

// SUPORTE PII — busca por CPF sem expor CPF completo, ou por e-mail quando o suporte
// já tem o identificador da conta. Revelação do CPF completo fica em endpoint separado.
router.get('/pii/lookup', async (req: AuthedRequest, res, next) => {
  try {
    const cpfInput = String(req.query.cpf ?? '').trim();
    const emailInput = String(req.query.email ?? '').toLowerCase().trim();
    const byEmail = !cpfInput && !!emailInput;
    const hash = cpfInput ? cpfFingerprint(cpfInput) : null;
    if (cpfInput && !hash) { res.status(400).json({ error: 'CPF inválido.' }); return; }
    if (byEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) { res.status(400).json({ error: 'E-mail inválido.' }); return; }
    if (!hash && !byEmail) { res.status(400).json({ error: 'Informe CPF ou e-mail.' }); return; }

    const [patients, doctors] = await Promise.all([
      prisma.patient.findMany({
        where: hash ? { cpfHash: hash } : { owner: { email: { equals: emailInput, mode: 'insensitive' } } },
        take: 10,
        select: { id: true, fullName: true, relationship: true, owner: { select: { id: true, name: true, email: true } }, cpfLast4: true, cpfEncrypted: true, cpfIv: true, identityLockedAt: true },
      }),
      prisma.doctor.findMany({
        where: hash ? { cpfHash: hash } : { email: { equals: emailInput, mode: 'insensitive' } },
        take: 10,
        select: { id: true, name: true, crm: true, crmUf: true, specialty: true, email: true, cpfLast4: true, cpfEncrypted: true, cpfIv: true, identityLockedAt: true },
      }),
    ]);
    await audit(byEmail ? 'LOOKUP_PII_EMAIL' : 'LOOKUP_CPF', req, {
      targetType: 'PII',
      after: { field: byEmail ? 'email' : 'cpf', emailMasked: byEmail ? maskEmail(emailInput) : undefined, matches: patients.length + doctors.length },
    });
    res.json({
      patients: patients.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        relationship: p.relationship,
        owner: p.owner,
        cpfMasked: maskStoredCpf(p),
        identityLocked: !!p.identityLockedAt,
      })),
      doctors: doctors.map((d) => ({
        id: d.id,
        name: d.name,
        crm: d.crm,
        crmUf: d.crmUf,
        specialty: d.specialty,
        email: d.email,
        cpfMasked: maskStoredCpf(d),
        identityLocked: !!d.identityLockedAt,
      })),
    });
  } catch (e) { next(e); }
});

// SUPORTE PII — revelação explícita e auditada. Não usar em telas comuns.
router.post('/pii/reveal', async (req: AuthedRequest, res, next) => {
  try {
    const targetType = String(req.body?.targetType ?? '').toUpperCase();
    const targetId = String(req.body?.targetId ?? '');
    const reason = String(req.body?.reason ?? '').trim();
    const ticketId = req.body?.ticketId ? String(req.body.ticketId) : undefined;
    if (!['PATIENT', 'DOCTOR'].includes(targetType) || !targetId) { res.status(400).json({ error: 'targetType e targetId obrigatórios.' }); return; }
    if (reason.length < 5) { res.status(400).json({ error: 'Informe o motivo/ticket para revelar CPF.' }); return; }

    const row = targetType === 'PATIENT'
      ? await prisma.patient.findUnique({ where: { id: targetId }, select: { cpfEncrypted: true, cpfIv: true, cpfLast4: true } })
      : await prisma.doctor.findUnique({ where: { id: targetId }, select: { cpfEncrypted: true, cpfIv: true, cpfLast4: true } });
    if (!row) { res.status(404).json({ error: 'Registro não encontrado.' }); return; }
    const cpf = revealStoredCpf(row);
    if (!cpf) { res.status(404).json({ error: 'CPF não cadastrado ou indisponível.' }); return; }

    await audit('REVEAL_CPF', req, {
      targetType,
      targetId,
      after: { field: 'cpf', reason, ticketId, cpfMasked: maskStoredCpf(row) },
    });
    res.json({ cpf, cpfMasked: maskStoredCpf(row), expiresAt: new Date(Date.now() + 60_000).toISOString() });
  } catch (e) { next(e); }
});

// LISTAR usuários (busca ?q= + paginação ?page=&limit= server-side; sem params mantém o total)
router.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const where: any = q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {};
    const [rows, total, examCount, subCount, approvedRevenue] = await Promise.all([
      prisma.user.findMany({ where, select: { id: true, email: true, name: true, role: true, credits: true, planExpiresAt: true, createdAt: true, blocked: true, mfaEnabled: true, patients: { select: { id: true, photoUrl: true }, orderBy: { createdAt: 'asc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.user.count({ where }),
      prisma.exam.count(),
      prisma.subscription.count(),
      prisma.subscription.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } }),
    ]);
    // patientId/foto: admin mostra a foto do cadastro (patients[0] = perfil principal)
    const users = rows.map(({ patients, ...u }) => ({ ...u, patientId: patients[0]?.id ?? null, hasPhoto: !!patients[0]?.photoUrl }));
    res.json({ users, total, page, limit, hasMore: page * limit < total, stats: { users: total, exams: examCount, subscriptions: subCount, revenue: approvedRevenue._sum.amount ?? 0 } });
  } catch (e) { next(e); }
});

// USO DE IA — quem gasta, quanto, quais transações (drill-down no admin)
router.get('/credit-usage', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, credits: true,
        creditTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 50, // últimas 50 por usuário (drill-down)
          select: { id: true, delta: true, kind: true, label: true, createdAt: true },
        },
      },
      orderBy: { credits: 'desc' },
    });
    const rows = users
      .map((u) => ({
        userId: u.id,
        email: u.email,
        name: u.name,
        credits: u.credits,
        totalSpent: u.creditTransactions.filter((t) => t.delta < 0).reduce((s, t) => s + Math.abs(t.delta), 0),
        totalEarned: u.creditTransactions.filter((t) => t.delta > 0).reduce((s, t) => s + t.delta, 0),
        txCount: u.creditTransactions.length,
        lastTxAt: u.creditTransactions[0]?.createdAt?.toISOString() ?? null,
        transactions: u.creditTransactions.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
      }))
      .filter((r) => r.txCount > 0); // só quem tem movimento
    res.json({ users: rows });
  } catch (e) { next(e); }
});

// LISTAR pagamentos (filtros ?status=&type=&q= + paginação ?page=; sem params = compatível)
router.get('/payments', async (req, res, next) => {
  try {
    const subscriptionColumns = await getSubscriptionColumnSupport();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const take = 20;
    const status = String(req.query.status ?? '').trim();
    const type = String(req.query.type ?? '').trim(); // 'mensal' | 'creditos'
    const q = String(req.query.q ?? '').trim();
    const where: any = {};
    if (status) where.status = status;
    if (type === 'mensal') where.periodDays = { gt: 0 };
    else if (type === 'creditos') where.periodDays = 0;
    if (q) where.user = { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] };
    const [subs, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
        select: {
          id: true,
          userId: true,
          mpPaymentId: true,
          mpPreferenceId: true,
          amount: true,
          periodDays: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          ...(subscriptionColumns.hasRawWebhook ? { rawWebhook: true } : {}),
          user: { select: { email: true, name: true } },
        },
      }),
      prisma.subscription.count({ where }),
    ]);
    res.json({ payments: subs, total, page, hasMore: page * take < total });
  } catch (e) { next(e); }
});

// CONFIG — leitura (tudo do banco: creditCosts/uploadRules/grants/shares/plans/creditPacks/premium/founder)
router.get('/config', (_req, res) => {
  const s = getSettings();
  res.json({ ...s, plans: { monthly: { ...getMonthlyPlan(), credits: s.grants.monthly } } });
});

// CONFIG — atualizar (PERSISTE no banco via saveSettings). Dois formatos:
//  1) numérico flat (legado): { category: 'creditCosts', chat: 2, ... }
//  2) objeto/array (novas categorias): { category: 'plans', value: {...} } — substitui a categoria
// Validações server-side: preço > 0; packs com id/créditos/preço > 0; founder.price ≤ plano.
const NUMERIC_CATEGORIES = ['creditCosts', 'uploadRules', 'grants', 'shares'];
const OBJECT_CATEGORIES = ['plans', 'premium', 'founder', 'creditPacks', 'badges'];
router.patch('/config/costs', async (req, res, next) => {
  try {
    const category = String(req.body?.category);
    if (NUMERIC_CATEGORIES.includes(category)) {
      const patch: Record<string, number> = {};
      for (const [k, v] of Object.entries(req.body ?? {})) {
        if (k === 'category') continue;
        const n = Number(v);
        if (!isNaN(n)) patch[k] = n;
      }
      if (Object.keys(patch).length === 0) { res.status(400).json({ error: 'Nenhum valor numérico válido enviado.' }); return; }
      const s = await saveSettings(category as SettingCategory, patch);
      console.log('[admin] config atualizada (persistida no banco):', category, patch);
      res.json({ ...s, plans: { monthly: { ...getMonthlyPlan(), credits: s.grants.monthly } } });
      return;
    }
    if (OBJECT_CATEGORIES.includes(category)) {
      const value = req.body?.value;
      if (category === 'plans') {
        const price = Number(value?.monthly?.price);
        if (!Number.isFinite(price) || price <= 0) { res.status(400).json({ error: 'Preço mensal inválido (deve ser > 0).' }); return; }
      }
      if (category === 'creditPacks') {
        if (!Array.isArray(value) || !value.length || !value.every((p: any) => p?.id && Number(p.credits) > 0 && Number(p.price) > 0)) {
          res.status(400).json({ error: 'Pacotes inválidos: cada um precisa de id, créditos > 0 e preço > 0.' }); return;
        }
      }
      if (category === 'founder') {
        const price = Number(value?.price);
        if (Number(value?.enabled) === 1 && (!Number.isFinite(price) || price <= 0 || price >= getMonthlyPlan().price)) {
          res.status(400).json({ error: `Preço fundador inválido: deve ser > 0 e MENOR que o preço cheio (R$ ${getMonthlyPlan().price.toFixed(2).replace('.', ',')}).` }); return;
        }
        if (Number(value?.limit) < Number(value?.used ?? 0)) { res.status(400).json({ error: 'Limite fundador menor que as vagas já usadas.' }); return; }
      }
      const s = await saveSettings(category as SettingCategory, value, true);
      console.log('[admin] config atualizada (persistida no banco):', category, JSON.stringify(value));
      res.json({ ...s, plans: { monthly: { ...getMonthlyPlan(), credits: s.grants.monthly } } });
      return;
    }
    res.status(400).json({ error: `category inválida. Numéricas: ${NUMERIC_CATEGORIES.join('|')}. Objeto: ${OBJECT_CATEGORIES.join('|')}.` });
  } catch (e) { next(e); }
});

// ===== IA — config do provedor (banco, editável aqui na aba IA) =====
// Resposta EFETIVA (banco → .env → default): mostra o que TÁ RODANDO (baseURL/modelo/chave mascarada),
// mesmo quando NÃO há linha no banco (cai no .env). A chave nunca vem completa — só •••• + últimos 4.
function aiConfigResponse() {
  const active = getActiveProvider();
  const providers = AI_PROVIDERS.map((p) => {
    const eff = resolveProviderConfig(p);
    const keyMasked = eff.apiKey ? (eff.apiKey.length <= 4 ? '••••' : '••••' + eff.apiKey.slice(-4)) : null;
    return { provider: p, active: p === active, baseURL: eff.baseURL ?? null, model: eff.model, keyMasked };
  });
  return { activeProvider: active, providers };
}

// GET: os 3 providers com a chave MASCARADA (••••1234) — nunca expõe a chave cheia.
router.get('/ai-config', (_req, res) => {
  res.json(aiConfigResponse());
});

// PATCH: define o provider ativo + (opcional) chave/baseURL/modelo.
//   Transação garante exatamente 1 linha active=true. apiKey vazio = mantém a chave existente.
//   Chave cifrada AES-256-GCM (encryptPII). refreshLlm() reconstrói o adapter em runtime.
router.patch('/ai-config', async (req, res, next) => {
  try {
    const provider = String(req.body?.provider ?? '').toLowerCase();
    if (!AI_PROVIDERS.includes(provider as AiProviderName)) {
      res.status(400).json({ error: 'provider inválido. Use anthropic | openai | gemini.' }); return;
    }
    const p = provider as AiProviderName;
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const baseURL = typeof req.body?.baseURL === 'string' ? req.body.baseURL.trim() : undefined;
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;

    const before = { activeProvider: getActiveProvider(), providers: getConfigRows() };

    const existing = await prisma.aiProviderConfig.findUnique({ where: { provider: p } });
    let apiKeyEnc = existing?.apiKeyEnc ?? null;
    let apiKeyIv = existing?.apiKeyIv ?? null;
    if (apiKey) { const enc = encryptPII(apiKey); if (enc) { apiKeyEnc = enc.enc; apiKeyIv = enc.iv; } }

    // Atômico: desativa todos + ativa o escolhido na mesma transação (garante exatamente 1 ativo).
    await prisma.$transaction([
      prisma.aiProviderConfig.updateMany({ where: { active: true }, data: { active: false } }),
      prisma.aiProviderConfig.upsert({
        where: { provider: p },
        update: { active: true, apiKeyEnc, apiKeyIv, ...(baseURL !== undefined ? { baseURL: baseURL || null } : {}), ...(model !== undefined ? { model: model || null } : {}) },
        create: { provider: p, active: true, apiKeyEnc, apiKeyIv, baseURL: baseURL || null, model: model || null },
      }),
    ]);

    await refreshLlm();
    await audit('UPDATE_AI_CONFIG', req, { targetType: 'AI_CONFIG', before, after: { activeProvider: getActiveProvider(), providers: getConfigRows() } });
    console.log('[admin] config de IA atualizada (banco):', p);
    res.json(aiConfigResponse());
  } catch (e) { next(e); }
});

// POST /test: testa a conexão (override do body → config salva → env). NÃO persiste.
router.post('/ai-config/test', async (req, res, next) => {
  try {
    const provider = String(req.body?.provider ?? '').toLowerCase();
    if (!AI_PROVIDERS.includes(provider as AiProviderName)) {
      res.status(400).json({ error: 'provider inválido. Use anthropic | openai | gemini.' }); return;
    }
    const override: { apiKey?: string; baseURL?: string; model?: string } = {};
    if (typeof req.body?.apiKey === 'string' && req.body.apiKey.trim()) override.apiKey = req.body.apiKey.trim();
    if (typeof req.body?.baseURL === 'string' && req.body.baseURL.trim()) override.baseURL = req.body.baseURL.trim();
    if (typeof req.body?.model === 'string' && req.body.model.trim()) override.model = req.body.model.trim();
    const result = await testLlmConnection(provider as AiProviderName, override);
    res.json(result);
  } catch (e) { next(e); }
});

// ===== IA — catálogo de MODELOS por provedor (dropdown editável, não hardcoded) =====
// GET: lista (opcional ?provider=anthropic|openai|gemini).
router.get('/ai-models', async (req, res, next) => {
  try {
    const provider = String(req.query.provider ?? '');
    const rows = await prisma.aiModel.findMany({
      where: provider ? { provider } : {},
      orderBy: [{ provider: 'asc' }, { sort: 'asc' }, { label: 'asc' }],
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// POST: adiciona um modelo. body: { provider, model, label? }. Unique (provider+model) → 409 se já existe.
router.post('/ai-models', async (req, res, next) => {
  try {
    const provider = String(req.body?.provider ?? '').toLowerCase();
    const model = String(req.body?.model ?? '').trim();
    const label = String(req.body?.label ?? '').trim() || model;
    if (!AI_PROVIDERS.includes(provider as AiProviderName) || !model) {
      res.status(400).json({ error: 'Envie { provider, model, label? }. provider ∈ anthropic|openai|gemini.' }); return;
    }
    const p = provider as AiProviderName;
    let created;
    try {
      created = await prisma.aiModel.create({ data: { provider: p, model, label } });
    } catch (e: any) {
      if (e?.code === 'P2002') { res.status(409).json({ error: 'Esse modelo já existe pra esse provedor.' }); return; }
      throw e;
    }
    await audit('CREATE_AI_MODEL', req, { targetType: 'AI_MODEL', after: { provider: p, model, label } });
    console.log('[admin] modelo de IA adicionado:', p, model);
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// DELETE: remove um modelo do catálogo (id).
router.delete('/ai-models/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const row = await prisma.aiModel.findUnique({ where: { id } });
    if (!row) { res.status(404).json({ error: 'Modelo não encontrado.' }); return; }
    await prisma.aiModel.delete({ where: { id } });
    await audit('DELETE_AI_MODEL', req, { targetType: 'AI_MODEL', before: { provider: row.provider, model: row.model, label: row.label } });
    console.log('[admin] modelo de IA removido:', row.provider, row.model);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ===== IA — CACHE DE EXPLICAÇÕES (exam_knowledge) =====
// Explicações leigas de exames/analitos (geradas por IA, reaproveitadas no /items/explain).
// Admin pode buscar/editar (vira source='curated')/regenerar/deletar.
// GET: lista (opcional ?q=busca &source=ai|curated), ordenada pelo mais recente.
router.get('/exam-knowledge', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const source = String(req.query.source ?? '').trim();
    const where: any = {};
    if (source) where.source = source;
    if (q) where.OR = [
      { nameKey: { contains: q, mode: 'insensitive' } },
      { nameDisplay: { contains: q, mode: 'insensitive' } },
      { titulo: { contains: q, mode: 'insensitive' } },
    ];
    const rows = await prisma.examKnowledge.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 500 });
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /:id/regenerate — recria a explicação via IA (reaproveita o nameDisplay salvo).
router.post('/exam-knowledge/:id/regenerate', async (req, res, next) => {
  try {
    const row = await prisma.examKnowledge.findUnique({ where: { id: String(req.params.id) } });
    if (!row) { res.status(404).json({ error: 'Explicação não encontrada.' }); return; }
    await generateExplanation(row.nameDisplay, row.locale);
    const fresh = await prisma.examKnowledge.findUnique({ where: { nameKey_locale: { nameKey: row.nameKey, locale: row.locale } } });
    await audit('REGENERATE_EXAM_KNOWLEDGE', req, { targetType: 'EXAM_KNOWLEDGE', targetId: row.id, after: fresh });
    res.json(fresh);
  } catch (e) { next(e); }
});

// PATCH /:id — edita campos (admin curou). Marca source='curated'.
router.patch('/exam-knowledge/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.examKnowledge.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Explicação não encontrada.' }); return; }
    const b = req.body ?? {};
    const data: any = { source: 'curated' };
    for (const f of ['titulo', 'resumo', 'analogia', 'alterado'] as const) {
      if (b[f] != null) data[f] = String(b[f]).trim() || null;
    }
    const updated = await prisma.examKnowledge.update({ where: { id }, data });
    await audit('UPDATE_EXAM_KNOWLEDGE', req, { targetType: 'EXAM_KNOWLEDGE', targetId: id, before: existing, after: updated });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /:id — remove do cache (próximo clique do /explain regenera).
router.delete('/exam-knowledge/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const row = await prisma.examKnowledge.findUnique({ where: { id } });
    if (!row) { res.status(404).json({ error: 'Explicação não encontrada.' }); return; }
    await prisma.examKnowledge.delete({ where: { id } });
    await audit('DELETE_EXAM_KNOWLEDGE', req, { targetType: 'EXAM_KNOWLEDGE', targetId: id, before: { nameKey: row.nameKey, source: row.source } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// MÉTRICAS/FUNIL (analytics) — signups → free → pago, receita (MRR/total), churn/retensão no
// vencimento e cohort por mês de signup. Pra o admin decidir com dado (ajustar preço/grants/custo).
router.get('/metrics', async (_req, res, next) => {
  try {
    const now = new Date();
    // --- FUNIL ---
    const [signups, verified, premiumActive] = await Promise.all([
      prisma.user.count({ where: { role: 'OWNER' } }),
      prisma.user.count({ where: { role: 'OWNER', emailVerified: true } }),
      prisma.user.count({ where: { role: 'OWNER', planExpiresAt: { gt: now } } }),
    ]);
    const freeActive = Math.max(0, verified - premiumActive);
    // --- RECEITA ---
    const agg = await prisma.subscription.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } });
    const [monthlyPayments, creditPurchases] = await Promise.all([
      prisma.subscription.count({ where: { status: 'APPROVED', periodDays: { gt: 0 } } }),
      prisma.subscription.count({ where: { status: 'APPROVED', periodDays: 0 } }),
    ]);
    // --- CHURN/RETENÇÃO (no vencimento) ---
    const everRows = await prisma.subscription.findMany({ where: { status: 'APPROVED', periodDays: { gt: 0 } }, select: { userId: true }, distinct: ['userId'] });
    const everPremium = everRows.length;
    const stillActive = await prisma.user.count({ where: { role: 'OWNER', planExpiresAt: { gt: now }, subscriptions: { some: { status: 'APPROVED', periodDays: { gt: 0 } } } } });
    const churned = Math.max(0, everPremium - stillActive);
    const renewalRows = await prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*)::int AS cnt FROM (SELECT "userId" FROM subscriptions WHERE status='APPROVED' AND "periodDays" > 0 GROUP BY "userId" HAVING COUNT(*) >= 2) t`;
    const renewals = Number(renewalRows[0]?.cnt ?? 0);
    // --- COHORT (signup mês → conversão) ---
    const cohort = await prisma.$queryRaw<{ month: string; signups: bigint; converted: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', u."createdAt"), 'YYYY-MM') AS month,
             COUNT(DISTINCT u.id) AS signups,
             COUNT(DISTINCT s."userId") AS converted
      FROM users u
      LEFT JOIN subscriptions s ON s."userId" = u.id AND s.status = 'APPROVED' AND s."periodDays" > 0
      WHERE u."role" = 'OWNER'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 12`;
    // --- RECEITA por mês (pagamento aprovado) ---
    const revenueByMonth = await prisma.$queryRaw<{ month: string; amount: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', "updatedAt"), 'YYYY-MM') AS month, SUM("amount")::bigint AS amount
      FROM subscriptions WHERE status = 'APPROVED' GROUP BY 1 ORDER BY 1 DESC LIMIT 12`;
    res.json({
      funnel: { signups, verified, freeActive, premiumActive, conversionPct: verified ? Math.round((premiumActive / verified) * 1000) / 10 : 0 },
      revenue: { mrr: Math.round(premiumActive * getMonthlyPlan().price * 100) / 100, total: Math.round((agg._sum.amount ?? 0) * 100) / 100, monthlyPayments, creditPurchases },
      churn: { everPremium, stillActive, churned, renewals, retentionPct: everPremium ? Math.round((stillActive / everPremium) * 1000) / 10 : 0 },
      cohort: cohort.map((r) => ({ month: r.month, signups: Number(r.signups), converted: Number(r.converted) })).filter((r) => r.month),
      revenueByMonth: revenueByMonth.map((r) => ({ month: r.month, amount: Number(r.amount) })).filter((r) => r.month),
    });
  } catch (e) { next(e); }
});

// AJUSTAR créditos — grava LEDGER (delta) + auditoria. Antes setava o saldo se rastro nenhum:
// meses de ajustes admin ficavam invisíveis no extrato e a reconciliação saldo×extrato quebrava
// (auditoria 2026-08-16: dono com 97.268 créditos × extrato -2.627).
router.patch('/users/:id/credits', async (req: AuthedRequest, res, next) => {
  try {
    const credits = Number(req.body?.credits);
    if (isNaN(credits) || credits < 0) { res.status(400).json({ error: 'credits deve ser número >= 0' }); return; }
    const id = String(req.params.id);
    const before = await prisma.user.findUnique({ where: { id }, select: { credits: true } });
    const delta = credits - (before?.credits ?? 0);
    const u = await prisma.user.update({ where: { id }, data: { credits }, select: { id: true, email: true, credits: true } });
    if (delta !== 0) {
      await logCredit(id, delta, 'admin_adjust', `Ajuste admin (${before?.credits ?? 0} → ${credits})`);
      await audit('ADMIN_CREDITS', req, { actorType: 'ADMIN', actorId: req.userId, targetType: 'USER', targetId: id, before: { credits: before?.credits ?? 0 }, after: { credits } });
    }
    res.json(u);
  } catch (e) { next(e); }
});

// AJUSTAR plano (premium/null)
router.patch('/users/:id/plan', async (req: AuthedRequest, res, next) => {
  try {
    const planExpiresAt = req.body?.planExpiresAt ? new Date(req.body.planExpiresAt) : null;
    const u = await prisma.user.update({ where: { id: String(req.params.id) }, data: { planExpiresAt }, select: { id: true, email: true, planExpiresAt: true } });
    res.json(u);
  } catch (e) { next(e); }
});

// DELETAR usuário — lista o que vai ser apagado antes
router.get('/users/:id/impact', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const patientIds = (await prisma.patient.findMany({ where: { ownerId: id }, select: { id: true } })).map(p => p.id);
    const [patients, exams, analyses] = await Promise.all([
      prisma.patient.count({ where: { ownerId: id } }),
      prisma.exam.count({ where: { patientId: { in: patientIds } } }),
      prisma.aiAnalysis.count({ where: { patientId: { in: patientIds } } }),
    ]);
    res.json({ patients, exams, analyses });
  } catch (e) { next(e); }
});

// DELETAR usuário
router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    // deleta arquivos dos exames antes do cascade
    const exams = await prisma.exam.findMany({ where: { patient: { ownerId: id } }, select: { filePath: true } });
    for (const e of exams) { try { await deleteExamFile(e.filePath); } catch { /* */ } }
    await prisma.user.delete({ where: { id } }); // cascade: Patient→Exam→Items/Analyses
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// === DOMÍNIOS DE E-MAIL BLOQUEADOS (descartáveis/temporários — anti-farm de créditos) ===
// Lista configurável (banco). Sync puxa de uma lista pública comunitária e faz merge.
router.get('/blocked-domains', (_req, res) => {
  res.json({ domains: listBlockedDomains() });
});
router.post('/blocked-domains', async (req, res, next) => {
  try {
    const domain = String(req.body?.domain ?? '').trim();
    if (!domain) { res.status(400).json({ error: 'Informe o domínio (ex.: mailinator.com).' }); return; }
    await addBlockedDomain(domain);
    res.json({ ok: true, domains: listBlockedDomains() });
  } catch (e) { next(e); }
});
router.delete('/blocked-domains/:domain', async (req, res, next) => {
  try {
    await removeBlockedDomain(String(req.params.domain));
    res.json({ ok: true, domains: listBlockedDomains() });
  } catch (e) { next(e); }
});
router.post('/blocked-domains/sync', async (_req, res) => {
  try {
    const r = await syncBlockedDomains();
    res.json({ ok: true, ...r });
  } catch (e: any) { res.status(502).json({ error: e?.message || 'Falha ao sincronizar com a lista pública.' }); }
});

// PUSH GLOBAL — broadcast de engajamento pra TODOS os dispositivos com token cadastrado.
// Body: { title, body, route? }. Só dispara o push (NÃO cria Notification por usuário —
// broadcast leve e genérico; o engajamento personalizado fica no job healthNudges).
// Firebase Admin precisa estar configurado (service account) — senão conta os tokens mas não entrega.
router.post('/push/global', async (req: AuthedRequest, res, next) => {
  try {
    const title = String(req.body?.title ?? '').trim();
    const body = String(req.body?.body ?? '').trim();
    const route = req.body?.route ? String(req.body.route) : undefined;
    if (!title || !body) { res.status(400).json({ error: 'title e body são obrigatórios' }); return; }
    const tokens = await prisma.deviceToken.findMany({ select: { token: true, userId: true } });
    const list = tokens.map((t) => t.token);
    // Notificação IN-APP pra cada usuário com dispositivo (aparece na central do app — sininho —
    // além do push do sistema). Antes só mandava o push do sistema; a in-app não era criada.
    const userIds = [...new Set(tokens.map((t) => t.userId))];
    if (userIds.length) await prisma.notification.createMany({ data: userIds.map((uid) => ({ userId: uid, type: 'global', title, body, data: { type: 'global', ...(route ? { route } : {}) } })) }).catch(() => {});
    await sendPush(list, title, body, { type: 'global', ...(route ? { route } : {}) });
    // Registra como campanha (histórico no backoffice).
    await prisma.pushCampaign.create({ data: { name: title.slice(0, 60), title, body, route: route ?? null, sentAt: new Date(), sentCount: list.length, createdBy: req.userId ?? null } }).catch(() => {});
    console.log(`[admin] push global enviado por ${req.userId}: "${title}" → ${list.length} dispositivo(s)`);
    res.json({ ok: true, sent: list.length, topic: PUSH_TOPIC });
  } catch (e) { next(e); }
});

// BLOQUEAR / DESBLOQUEAR usuário (super admin). Usuário bloqueado, ao logar, recebe
// mensagem amigável (vaga) p/ contatar o suporte; a sessão ativa dele é derrubada (requireAuth).
router.post('/users/:id/block', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    if (id === req.userId) { res.status(400).json({ error: 'Você não pode bloquear a si mesmo.' }); return; }
    await prisma.user.update({ where: { id }, data: { blocked: true } });
    void audit('BLOCK_USER', req, { targetType: 'USER', targetId: id, after: { blocked: true } });
    console.log(`[admin] usuário ${id} bloqueado por ${req.userId}`);
    res.json({ ok: true, blocked: true });
  } catch (e) { next(e); }
});
router.post('/users/:id/unblock', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    await prisma.user.update({ where: { id }, data: { blocked: false } });
    void audit('UNBLOCK_USER', req, { targetType: 'USER', targetId: id, after: { blocked: false } });
    console.log(`[admin] usuário ${id} desbloqueado por ${req.userId}`);
    res.json({ ok: true, blocked: false });
  } catch (e) { next(e); }
});

// RESET MFA — admin desativa o MFA de um usuário sem exigir código TOTP (lockout recovery).
// Limpa os campos MFA do User (paciente) E do Doctor (se tiver conta de médico vinculada).
router.post('/users/:id/reset-mfa', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const mfaClear = { mfaEnabled: false, mfaSecretEncrypted: null, mfaSecretIv: null, mfaSecretAuthTag: null, mfaConfirmedAt: null };
    const user = await prisma.user.update({ where: { id }, data: mfaClear, select: { id: true, email: true, name: true } });
    void audit('RESET_MFA', req, { targetType: 'USER', targetId: id, after: { mfaEnabled: false, resetBy: 'admin' } });
    console.log(`[admin] MFA resetado para ${user.email} (${id}) por ${req.userId}`);
    res.json({ ok: true, mfaEnabled: false, message: `MFA desativado para ${user.name || user.email}. Ele pode logar com senha e reconfigurar.` });
  } catch (e) { next(e); }
});

// ===== BACKOFFICE — endpoints read-only dos novos módulos (todos atrás de requireAdmin) =====

// MÉDICOS — lista CRM/UF + validação e-mail + pacientes compartilhados ativos.
router.get('/doctors', async (_req, res, next) => {
  try {
    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, name: true, crm: true, crmUf: true, specialty: true, email: true, emailVerified: true, photoUrl: true, createdAt: true, _count: { select: { shares: { where: { active: true } } } } } }),
      prisma.doctor.count(),
    ]);
    res.json({ doctors, total });
  } catch (e) { next(e); }
});

// EXAMES — lista (filtro ?status= opcional) + contagem por status + recentes com falha.
router.get('/exams', async (req, res, next) => {
  try {
    const status = String(req.query.status ?? '');
    const where: any = status ? { status } : {};
    const [exams, byStatus, recentFailed] = await Promise.all([
      prisma.exam.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, kind: true, status: true, performedAt: true, createdAt: true, extractionError: true, _count: { select: { items: true } }, patient: { select: { fullName: true } } } }),
      prisma.exam.groupBy({ by: ['status'], _count: true }),
      prisma.exam.findMany({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, title: true, extractionError: true, createdAt: true } }),
    ]);
    res.json({ exams, byStatus, recentFailed });
  } catch (e) { next(e); }
});

// IA & ALERTAS — ai_analyses (volume histórico, tem dados) + AiUsageLog (custo/latência, novo).
router.get('/ia-usage', async (_req, res, next) => {
  try {
    const [recent, analysesCount, byModel, agg] = await Promise.all([
      prisma.aiAnalysis.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, type: true, modelUsed: true, tokenUsage: true, createdAt: true, exam: { select: { title: true } } } }),
      prisma.aiAnalysis.count(),
      prisma.aiAnalysis.groupBy({ by: ['modelUsed'], _count: true }),
      prisma.aiUsageLog.aggregate({ _sum: { costBrl: true, promptTokens: true, completionTokens: true }, _avg: { latencyMs: true }, _count: true }),
    ]);
    res.json({ recent, analysesCount, byModel, totalLogs: agg._count, totalCost: agg._sum.costBrl ?? 0, totalTokens: (agg._sum.promptTokens ?? 0) + (agg._sum.completionTokens ?? 0), avgLatency: Math.round(agg._avg.latencyMs ?? 0) });
  } catch (e) { next(e); }
});

// SAÚDE TÉCNICA — status do sistema: exames por status, jobs presos, falhas 24h, IA, db.
router.get('/tech', async (_req, res, next) => {
  try {
    const [examStatus, stuck, failed24h, aiCount, users, devices, jobs] = await Promise.all([
      prisma.exam.groupBy({ by: ['status'], _count: true }),
      prisma.exam.count({ where: { status: 'EXTRACTING' } }),
      prisma.exam.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      prisma.aiAnalysis.count(),
      prisma.user.count(),
      prisma.deviceToken.count(),
      prisma.processingJob.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
    ]);
    res.json({ examStatus, stuck, failed24h, aiCount, users, devices, jobs, db: 'ok', ts: new Date().toISOString() });
  } catch (e) { next(e); }
});

// AUDITORIA — lê o AuditLog dedicado (LGPD): login/acesso do usuário + ações admin/doctor/sistema.
// Filtros (query, todos opcionais): kind (logins|access|admin|all), action, actorType,
//   userId (=actorId), from, to (datas ISO). Paginação: take (1-200, default 50), skip.
router.get('/audit', async (req: AuthedRequest, res, next) => {
  try {
    const q = (req.query || {}) as Record<string, string>;
    const take = Math.min(Math.max(Number(q.take ?? 50) || 50, 1), 200);
    const skip = Math.max(Number(q.skip ?? 0) || 0, 0);
    const kind = q.kind ?? '';
    const conds: any[] = [];
    if (q.action) conds.push({ action: q.action });
    if (q.actorType) conds.push({ actorType: q.actorType });
    if (q.userId) conds.push({ actorId: q.userId });
    if (kind === 'logins') conds.push({ action: { startsWith: 'LOGIN' } });
    else if (kind === 'access') conds.push({ action: 'ACCESS' });
    else if (kind === 'admin') { conds.push({ action: { not: { startsWith: 'LOGIN' } } }, { action: { not: 'ACCESS' } }); }
    if (q.from || q.to) {
      const createdAt: any = {};
      if (q.from) createdAt.gte = new Date(q.from);
      if (q.to) createdAt.lte = new Date(q.to);
      conds.push({ createdAt });
    }
    const where = conds.length ? { AND: conds } : {};
    const [auditLogs, count, byAction, byActorType] = await Promise.all([
      prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, take, skip,
        select: { id: true, actorType: true, actorId: true, action: true, targetType: true, targetId: true, ip: true, before: true, after: true, createdAt: true },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({ by: ['action'], _count: true, where }),
      prisma.auditLog.groupBy({ by: ['actorType'], _count: true, where }),
    ]);
    // Lookup de nome/email dos actors (actorId/targetId são cuid — a tela precisa identificar a
    // PESSOA, não um hash). Busca só os IDs que aparecem nesta página.
    const ids = new Set<string>();
    for (const l of auditLogs) {
      if (l.actorId) ids.add(l.actorId);
      if ((l.targetType === 'USER' || l.targetType === 'DOCTOR') && l.targetId) ids.add(l.targetId);
    }
    const [uRows, dRows] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, email: true } }),
      prisma.doctor.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, email: true } }),
    ]);
    const actors: Record<string, { name: string; email: string; type: string }> = {};
    for (const u of uRows) actors[u.id] = { name: u.name, email: u.email, type: 'USER' };
    for (const dd of dRows) actors[dd.id] = { name: dd.name, email: dd.email, type: 'DOCTOR' };
    res.json({ auditLogs, count, byAction, byActorType, take, skip, actors });
  } catch (e) { next(e); }
});

// RISK QUALITY — taxa de aprovação do plano de ação por condição (loop de melhoria da IA).
// Agrega RiskFeedback × RiskAssessment pra mostrar onde refinar os cards .md e os prompts.
router.get('/risk-quality', async (_req, res, next) => {
  try {
    const byCondition = await prisma.$queryRaw<{ conditionKey: string; total: number; up: number; down: number }[]>`
      SELECT ra."conditionKey" AS "conditionKey",
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE rf.rating = 1)::int AS up,
             COUNT(*) FILTER (WHERE rf.rating = 0)::int AS down
      FROM risk_feedbacks rf
      JOIN risk_assessments ra ON ra.id = rf."riskAssessmentId"
      GROUP BY ra."conditionKey"
      ORDER BY total DESC`;
    const totalFeedbacks = await prisma.riskFeedback.count();
    const negativeComments = await prisma.riskFeedback.findMany({
      where: { rating: 0, NOT: { comment: null } },
      orderBy: { createdAt: 'desc' }, take: 20,
      include: { riskAssessment: { select: { conditionKey: true } } },
    });
    res.json({ byCondition, totalFeedbacks, negativeComments });
  } catch (e) { next(e); }
});

// RISK DATASET (FLYWHEEL) — registros ANONIMIZADOS (sem PHI) doados por opt-in, p/ retreinar o ML.
router.get('/risk-dataset', async (_req, res, next) => {
  try {
    const [records, byCondition, total] = await Promise.all([
      prisma.dataContributionRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 }),
      prisma.dataContributionRecord.groupBy({ by: ['conditionKey'], _count: true }),
      prisma.dataContributionRecord.count(),
    ]);
    res.json({ total, count: records.length, byCondition, records });
  } catch (e) { next(e); }
});

// PUSH CAMPAIGNS — histórico de campanhas enviadas.
router.get('/push/campaigns', async (_req, res, next) => {
  try { res.json({ campaigns: await prisma.pushCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }) }); } catch (e) { next(e); }
});

// SUPPORT TICKETS — fila do backoffice: lista (user + não-lidos), thread, responder (notifica usuário), status.
router.get('/tickets', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const where: any = {};
    if (status && ['open', 'pending', 'closed'].includes(status)) where.status = status;
    const [tickets, openCount, unreadByAdmin] = await Promise.all([
      prisma.supportTicket.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
      prisma.supportTicket.count({ where: { unreadByAdmin: true } }),
    ]);
    const userIds = [...new Set(tickets.map((t) => t.userId))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    res.json({ tickets: tickets.map((t) => ({ ...t, user: userMap.get(t.userId) ?? null })), openCount, unreadByAdmin });
  } catch (e) { next(e); }
});
// admin cria chamado manualmente (mantém compat; o paciente cria via /api/tickets)
router.post('/tickets', async (req: AuthedRequest, res, next) => {
  try {
    const userId = String(req.body?.userId ?? '');
    const subject = String(req.body?.subject ?? '').trim();
    if (!userId || !subject) { res.status(400).json({ error: 'userId e subject são obrigatórios' }); return; }
    const t = await prisma.supportTicket.create({ data: { userId, subject, priority: String(req.body?.priority ?? 'normal'), unreadByAdmin: false } });
    void audit('CREATE_TICKET', req, { targetType: 'TICKET', targetId: t.id });
    res.json({ ok: true, id: t.id });
  } catch (e) { next(e); }
});
// ver thread completa + dados do usuário (URL do anexo aponta pro endpoint admin)
router.get('/tickets/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: String(req.params.id) },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }
    if (ticket.unreadByAdmin) await prisma.supportTicket.update({ where: { id: ticket.id }, data: { unreadByAdmin: false } });
    // Contexto do usuário no chamado (padrão Zendesk: o agente responde sabendo COM quem fala).
    // credits/planExpiresAt/createdAt = chips de contexto no admin; sem select implícito.
    const user = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { id: true, name: true, email: true, credits: true, planExpiresAt: true, createdAt: true } });
    const messages = ticket.messages.map((m) => ({
      id: m.id, authorRole: m.authorRole, body: m.body, createdAt: m.createdAt,
      attachments: ((m.attachments as any[] | null) ?? []).map((a, idx) => ({ name: a.name, size: a.size, type: a.type, url: `admin/tickets/${ticket.id}/messages/${m.id}/attachments/${idx}` })),
    }));
    res.json({ ...ticket, user, unreadByAdmin: false, messages });
  } catch (e) { next(e); }
});

// ═══ API PÚBLICA — fila de acesso + visão de uso (Fase 2) ═══
// GET /admin/api-access: solicitações (com usuário), chaves ativas com saldo, totais vendidos.
router.get('/api-access', async (_req, res, next) => {
  try {
    const [requests, keys, packsSold, callsUsed] = await Promise.all([
      prisma.apiAccessRequest.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100,
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.apiKey.findMany({
        where: { revokedAt: null }, orderBy: { lastUsedAt: 'desc' }, take: 200,
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.creditTransaction.aggregate({ where: { kind: 'api_pack' }, _count: true, _sum: { delta: true } }),
      prisma.creditTransaction.aggregate({ where: { kind: 'api_call' }, _count: true, _sum: { delta: true } }),
    ]);
    // Saldo por usuário das chaves ativas (uma query, agrupa em código).
    const balances = await prisma.creditTransaction.groupBy({
      by: ['userId'], where: { kind: { in: ['api_grant', 'api_pack', 'api_call'] } }, _sum: { delta: true },
    });
    const balMap = new Map(balances.map((b) => [b.userId, b._sum.delta ?? 0]));
    res.json({
      requests,
      keys: keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt, user: k.user, balance: balMap.get(k.userId) ?? 0 })),
      totals: { purchases: packsSold._count, callsSold: packsSold._sum.delta ?? 0, callsUsed: Math.abs(callsUsed._sum?.delta ?? 0) },
    });
  } catch (e) { next(e); }
});

// Aprovar solicitação → concede pacote teste (apiAccess.freeMonthly) e libera criação de chaves.
router.post('/api-access/:id/approve', async (req: AuthedRequest, res, next) => {
  try {
    const row = await prisma.apiAccessRequest.findUnique({ where: { id: String(req.params.id) } });
    if (!row || row.status !== 'pending') { res.status(404).json({ error: 'Solicitação não encontrada/já avaliada.' }); return; }
    const free = Number(getSettings().apiAccess?.freeMonthly ?? 25);
    const updated = await prisma.apiAccessRequest.update({
      where: { id: row.id },
      data: { status: 'approved', reviewedAt: new Date(), note: String(req.body?.note ?? '').trim() || `Aprovado — pacote teste de ${free} chamadas liberado.` },
    });
    if (free > 0) await logCredit(row.userId, free, 'api_grant', 'Pacote teste da API (aprovação admin)', row.id);
    // Quem pediu fica sabendo NA HORA: push (+ notificação in-app) + e-mail.
    const requester = await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true, email: true } });
    if (requester) {
      await sendPushToUser(row.userId, '🔌 Acesso à API aprovado!', `Pacote de teste com ${free} chamadas liberado — crie sua chave no menu "API Dr. Exame".`, { type: 'api_access' }).catch(() => {});
      void sendEmail({
        to: requester.email,
        subject: '🔌 Seu acesso à API do Dr. Exame foi aprovado',
        html: `<p>Olá, ${requester.name ?? ''}!</p><p>Seu acesso à <b>API do Dr. Exame</b> foi aprovado — e você já tem <b>${free} chamadas de teste</b> disponíveis.</p><p><b>Próximo passo:</b> no app, menu <b>API Dr. Exame</b> → "+ Nova chave". A documentação completa está em <a href="https://drexame.janocaminho.com.br/api/docs">/api/docs</a>.</p>`,
        text: `Seu acesso à API foi aprovado — ${free} chamadas de teste liberadas. Crie sua chave no menu "API Dr. Exame" do app. Docs: https://drexame.janocaminho.com.br/api/docs`,
      }).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

router.post('/api-access/:id/reject', async (req: AuthedRequest, res, next) => {
  try {
    const row = await prisma.apiAccessRequest.findUnique({ where: { id: String(req.params.id) } });
    if (!row || row.status !== 'pending') { res.status(404).json({ error: 'Solicitação não encontrada/já avaliada.' }); return; }
    const note = String(req.body?.note ?? '').trim() || 'Não se encaixa no programa no momento.';
    const updated = await prisma.apiAccessRequest.update({
      where: { id: row.id },
      data: { status: 'rejected', reviewedAt: new Date(), note },
    });
    // Resposta honesta também na rejeição — ninguém fica no vácuo.
    const requester = await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true, email: true } });
    if (requester) {
      await sendPushToUser(row.userId, 'Solicitação de API avaliada', `Não foi aprovada neste momento. ${note}`, { type: 'api_access' }).catch(() => {});
      void sendEmail({
        to: requester.email,
        subject: 'Sua solicitação de acesso à API',
        html: `<p>Olá, ${requester.name ?? ''}.</p><p>Sua solicitação de acesso à API não foi aprovada neste momento.</p><p><b>Motivo:</b> ${note}</p><p>Se seu caso mudou, você pode solicitar novamente pelo app.</p>`,
        text: `Sua solicitação de API não foi aprovada. Motivo: ${note}`,
      }).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// Revogar chave de API (abuso/parceiro sai) — o usuário não pode reverter.
router.post('/api-keys/:id/revoke', async (req, res, next) => {
  try {
    const row = await prisma.apiKey.findUnique({ where: { id: String(req.params.id) } });
    if (!row || row.revokedAt) { res.status(404).json({ error: 'Chave não encontrada.' }); return; }
    res.json(await prisma.apiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } }));
  } catch (e) { next(e); }
});

// DECIFRE (landing, anônimo) — telemetria do funil pro dono "sentir o calor".
router.get('/decifre-stats', async (_req, res, next) => {
  try {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [today, week, total, uniqueIps] = await Promise.all([
      prisma.decifreEvent.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.decifreEvent.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.decifreEvent.count(),
      prisma.decifreEvent.groupBy({ by: ['ipHash'], _count: { _all: true } }),
    ]);
    const abnormalTotal = await prisma.decifreEvent.aggregate({ _sum: { abnormalCount: true } });
    res.json({
      today, week, total,
      uniqueIps: uniqueIps.length,
      withAbnormal: abnormalTotal._sum.abnormalCount ?? 0,
    });
  } catch (e) { next(e); }
});
// admin responde (multipart: message + files[]) → notifica usuário (push + email + in-app) + status 'pending'
router.post('/tickets/:id/messages', upload.array('files', 5), async (req: AuthedRequest, res, next) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: String(req.params.id) }, select: { id: true, number: true, userId: true, status: true, closedAt: true } });
    if (!ticket) { res.status(404).json({ error: 'Chamado não encontrado' }); return; }
    const user = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { email: true, name: true } });
    const body = String(req.body.message ?? '').trim();
    const files = req.files as Express.Multer.File[] | undefined;
    if (!body && !files?.length) { res.status(400).json({ error: 'Mensagem ou anexo obrigatório.' }); return; }
    const attachments: any[] = [];
    if (files?.length) for (const f of files.slice(0, 5)) {
      const ref = await saveExamFile(f.buffer, `tickets-${ticket.number}`, f.originalname, f.mimetype);
      attachments.push({ ref, name: f.originalname, size: f.size, type: f.mimetype });
    }
    const msg = await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorRole: 'admin', authorId: req.userId, body: body || '(anexo)', attachments: attachments.length ? attachments : undefined } });
    // Não desfaz um chamado já resolvido: se estava 'closed', permanece 'closed' (admin respondendo
    // uma msg extra pós-resolução não reabre silenciosamente). Caso contrário, vai pra 'pending'
    // (aguardando resposta do usuário).
    const nextStatus = ticket.status === 'closed' ? 'closed' : 'pending';
    const nextClosedAt = ticket.status === 'closed' ? ticket.closedAt : null;
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: nextStatus, lastMessageBy: 'admin', lastMessageAt: new Date(), unreadByUser: true, closedAt: nextClosedAt } });
    void audit('REPLY_TICKET', req, { targetType: 'TICKET', targetId: ticket.id });
    // notifica o usuário: push (grava Notification + FCM) + e-mail
    const preview = body ? (body.length > 80 ? body.slice(0, 80) + '…' : body) : 'O suporte enviou um anexo.';
    // AWAIT (não void): o registro Notification precisa existir ANTES da resposta — antes era
    // fire-and-forget e flakeava o teste (e podia perder a notificação in-app se o loop atrasasse).
    await sendPushToUser(ticket.userId, `Chamado #${ticket.number}`, preview, { type: 'ticket', ticketId: ticket.id }).catch(() => {});
    if (user?.email) {
      void sendEmail({
        to: user.email, subject: `Seu chamado #${ticket.number} teve uma resposta`,
        html: ticketReplyEmail({ name: user.name, ticketNumber: ticket.number, body, appUrl: webUrl('/#/suporte') }),
        text: `O suporte respondeu seu chamado #${ticket.number}: ${body || '(anexo)'}`,
      }).catch(() => {});
    }
    res.status(201).json({ id: msg.id, createdAt: msg.createdAt });
  } catch (e) { next(e); }
});
// mudar status / assignee / priority
router.patch('/tickets/:id', async (req: AuthedRequest, res, next) => {
  try {
    const data: any = {};
    const status = String(req.body.status ?? '');
    if (['open', 'pending', 'closed'].includes(status)) { data.status = status; data.closedAt = status === 'closed' ? new Date() : null; }
    if (req.body.assigneeId !== undefined) data.assigneeId = req.body.assigneeId ? String(req.body.assigneeId) : null;
    if (['low', 'normal', 'high'].includes(req.body.priority)) data.priority = String(req.body.priority);
    if (!Object.keys(data).length) { res.status(400).json({ error: 'Nada para atualizar (status | assigneeId | priority).' }); return; }
    const t = await prisma.supportTicket.update({ where: { id: String(req.params.id) }, data });
    void audit('UPDATE_TICKET', req, { targetType: 'TICKET', targetId: t.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// download de anexo (admin vê anexos do usuário)
router.get('/tickets/:id/messages/:messageId/attachments/:idx', async (req, res, next) => {
  try {
    const msg = await prisma.ticketMessage.findUnique({ where: { id: String(req.params.messageId) }, select: { ticketId: true, attachments: true } });
    if (!msg || msg.ticketId !== String(req.params.id)) { res.status(404).json({ error: 'Não encontrado' }); return; }
    const att = ((msg.attachments as any[] | null) ?? [])[Number(req.params.idx)];
    if (!att) { res.status(404).json({ error: 'Anexo não encontrado' }); return; }
    const r = await resolveExamFile(att.ref);
    if (r.kind === 'url') { res.redirect(302, r.url as string); return; }
    if (r.file && fs.existsSync(r.file)) { res.sendFile(path.resolve(r.file)); return; }
    res.status(404).json({ error: 'Arquivo não disponível' });
  } catch (e) { next(e); }
});

// ===== LABORATÓRIOS — CRUD + upload de logo (admin). O front casa sourceLab → marca por name/aliases. =====
router.get('/labs', async (_req, res, next) => {
  try { const labs = await prisma.lab.findMany({ orderBy: { name: 'asc' } }); res.json({ labs }); }
  catch (e) { next(e); }
});
router.post('/labs', async (req: AuthedRequest, res, next) => {
  try {
    const { name, color, aliases, active } = req.body ?? {};
    if (!name || !String(name).trim()) { res.status(400).json({ error: 'Informe o nome.' }); return; }
    const lab = await prisma.lab.create({ data: { name: String(name).trim(), slug: slugify(String(name)), color: color || null, aliases: Array.isArray(aliases) ? aliases.map(String) : [], active: active !== false } });
    invalidateLabsCache();
    res.status(201).json({ lab });
  } catch (e: any) { if (e?.code === 'P2002') { res.status(409).json({ error: 'Já existe um laboratório com esse nome.' }); return; } next(e); }
});
router.put('/labs/:id', async (req: AuthedRequest, res, next) => {
  try {
    const { name, color, aliases, active } = req.body ?? {};
    const data: any = {};
    if (name != null) { data.name = String(name).trim(); data.slug = slugify(String(name)); }
    if (color !== undefined) data.color = color || null;
    if (Array.isArray(aliases)) data.aliases = aliases.map(String);
    if (active !== undefined) data.active = !!active;
    const lab = await prisma.lab.update({ where: { id: String(req.params.id) }, data });
    invalidateLabsCache();
    res.json({ lab });
  } catch (e: any) { if (e?.code === 'P2002') { res.status(409).json({ error: 'Nome em uso.' }); return; } next(e); }
});
router.delete('/labs/:id', async (req: AuthedRequest, res, next) => {
  try { await prisma.lab.delete({ where: { id: String(req.params.id) } }); invalidateLabsCache(); res.json({ ok: true }); }
  catch (e) { next(e); }
});
// Upload do LOGO (multipart, campo 'logo'). Sharp otimiza → S3/disco. Público (immutable).
router.post('/labs/:id/logo', upload.single('logo'), async (req: AuthedRequest, res, next) => {
  try {
    const file = (req as any).file;
    if (!file?.buffer) { res.status(400).json({ error: 'Envie a imagem no campo "logo".' }); return; }
    const id = String(req.params.id);
    const logoUrl = await saveLabLogo(id, file.buffer);
    const lab = await prisma.lab.update({ where: { id }, data: { logoUrl } });
    invalidateLabsCache();
    res.json({ lab });
  } catch (e) { next(e); }
});

export default router;
