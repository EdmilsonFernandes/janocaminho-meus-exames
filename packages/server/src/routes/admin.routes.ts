import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { config, hasAsaas } from '../config';
import { postRefundExecuted, postEntries } from '../finance/ledger';
import { notifyTeleconsultaRefunded } from '../utils/teleconsultaNotify';
import { getSettings, saveSettings, getMonthlyPlan, type SettingCategory } from '../utils/settings';
import { deleteExamFile, saveExamFile, resolveExamFile, saveLabLogo } from '../utils/storage';
import { invalidateLabsCache, slugify } from './labs.routes';
import { listBlockedDomains, addBlockedDomain, removeBlockedDomain, syncBlockedDomains } from '../utils/blockedDomains';
import { sendPushToUser, PUSH_TOPIC } from '../utils/push';
import { parseAudienceFilter, resolveAudienceUserIds, dispatchCampaign, dispatchToUsers } from '../utils/pushAudience';
import { sendEmail } from '../utils/mailer';
import { ticketReplyEmail, webUrl } from '../utils/emailTemplate';
import { upload } from '../middleware/upload';
import { audit } from '../utils/audit';
import { logCredit } from '../utils/credits';
import { getConfigRows, getActiveProvider, AI_PROVIDERS, resolveProviderConfig, type AiProviderName } from '../llm/ai-config';
import { refreshLlm, testLlmConnection } from '../llm';
import { generateExplanation } from '../analysis/explain';
import { encryptPII, decryptPII } from '../utils/crypto';
import { cpfFingerprint, maskStoredCpf, revealStoredCpf } from '../utils/cpf';
import { getSubscriptionColumnSupport } from '../utils/subscriptionCompat';
import { DEFAULT_COMMISSION_RULE } from '../finance/rules';
import { approvePayout, getAsaasBalanceCached } from '../finance/payout';
import { payoutAutoEnabled } from '../utils/settings';
import { maskPixKey } from './doctor.routes';
import { getLastReconciliationAt } from '../jobs/reconciliation';
import { runExtraction } from '../extraction/pipeline';
import { normalizeCouponCode } from '../utils/coupons';

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
      prisma.user.findMany({ where, select: { id: true, email: true, name: true, role: true, credits: true, planExpiresAt: true, createdAt: true, termsAcceptedAt: true, termsVersion: true, termsUrl: true, blocked: true, mfaEnabled: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.user.count({ where }),
      prisma.exam.count(),
      prisma.subscription.count(),
      prisma.subscription.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } }),
    ]);
    // patientId/foto/dependentes: 1 query p/ todos os titulares da página (sem N+1).
    // Dependentes visíveis no admin desde 13/10 — caso "Claiza": esposa-dependente
    // invisível gerou falso mistério de usuário sumido. patients[0] = titular (createdAt asc).
    const ownerIds = rows.map((u) => u.id);
    const allPatients = ownerIds.length
      ? await prisma.patient.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, ownerId: true, fullName: true, relationship: true, photoUrl: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
      : [];
    const byOwner = new Map<string, typeof allPatients>();
    for (const p of allPatients) {
      const list = byOwner.get(p.ownerId) ?? [];
      list.push(p);
      byOwner.set(p.ownerId, list);
    }
    const users = rows.map((u) => {
      const fam = byOwner.get(u.id) ?? [];
      const main = fam[0];
      return {
        ...u,
        patientId: main?.id ?? null,
        hasPhoto: !!main?.photoUrl,
        dependents: fam.slice(1).map((d) => ({ fullName: d.fullName, relationship: d.relationship, createdAt: d.createdAt })),
      };
    });
    res.json({ users, total, page, limit, hasMore: page * limit < total, stats: { users: total, exams: examCount, subscriptions: subCount, revenue: approvedRevenue._sum.amount ?? 0 } });
  } catch (e) { next(e); }
});

// USO DE IA — quem gasta, quanto, quais transações (drill-down no admin)
router.get('/credit-usage', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, credits: true,
        // Dono 26/10: foto do paciente titular no admin de uso (mesma régua do UsersTab).
        patients: { select: { id: true, photoUrl: true, relationship: true }, take: 2 },
        creditTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 50, // últimas 50 por usuário (drill-down)
          select: { id: true, delta: true, kind: true, label: true, createdAt: true },
        },
      },
      orderBy: { credits: 'desc' },
    });
    const rows = users
      .map((u) => {
        const titular = u.patients?.find((p) => p.relationship === 'Titular') ?? u.patients?.[0] ?? null;
        return {
          userId: u.id,
          email: u.email,
          name: u.name,
          credits: u.credits,
          patientId: titular?.id ?? null,
          hasPhoto: !!titular?.photoUrl,
          totalSpent: u.creditTransactions.filter((t) => t.delta < 0).reduce((s, t) => s + Math.abs(t.delta), 0),
          totalEarned: u.creditTransactions.filter((t) => t.delta > 0).reduce((s, t) => s + t.delta, 0),
          txCount: u.creditTransactions.length,
          lastTxAt: u.creditTransactions[0]?.createdAt?.toISOString() ?? null,
          transactions: u.creditTransactions.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
        };
      })
      .filter((r) => r.txCount > 0); // só quem tem movimento

    // Ordenação padrão: quem transacionou mais recentemente vem primeiro!
    rows.sort((a, b) => {
      const ta = a.lastTxAt ? new Date(a.lastTxAt).getTime() : 0;
      const tb = b.lastTxAt ? new Date(b.lastTxAt).getTime() : 0;
      return tb - ta;
    });

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
const NUMERIC_CATEGORIES = ['creditCosts', 'uploadRules', 'grants', 'shares', 'guidelines', 'sportsMode'];
const OBJECT_CATEGORIES = ['plans', 'premium', 'founder', 'creditPacks', 'badges', 'motd', 'referral'];
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
// 18/10: (a) contas isTest (dono/equipe) FORA dos números; (b) PAYWALL hits (quem tentou
// usar IA sem saldo — sinal nº1 de disposição a pagar, antes invisível); (c) cohort SEMANAL
// (mensal é cego p/ base nova); (d) origem do cadastro (acquisitionSource do register).
router.get('/metrics', async (_req, res, next) => {
  try {
    const now = new Date();
    const real = { role: 'OWNER' as const, isTest: { not: true } };
    // --- FUNIL ---
    const [signups, verified, premiumActive] = await Promise.all([
      prisma.user.count({ where: real }),
      prisma.user.count({ where: { ...real, emailVerified: true } }),
      prisma.user.count({ where: { ...real, planExpiresAt: { gt: now } } }),
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
    const stillActive = await prisma.user.count({ where: { ...real, planExpiresAt: { gt: now }, subscriptions: { some: { status: 'APPROVED', periodDays: { gt: 0 } } } } });
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
      WHERE u."role" = 'OWNER' AND COALESCE(u."isTest", false) = false
      GROUP BY 1 ORDER BY 1 DESC LIMIT 12`;
    // --- RECEITA por mês (pagamento aprovado) ---
    const revenueByMonth = await prisma.$queryRaw<{ month: string; amount: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', "updatedAt"), 'YYYY-MM') AS month, SUM("amount")::bigint AS amount
      FROM subscriptions WHERE status = 'APPROVED' GROUP BY 1 ORDER BY 1 DESC LIMIT 12`;
    // --- PAYWALL HITS (18/10): tentativas travadas por saldo. Drift-safe (catch → 0). ---
    const paywallTotals = await prisma.$queryRaw<{ d7: bigint; d30: bigint; users30: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '7 days')::int AS d7,
             COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '30 days')::int AS d30,
             COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= now() - interval '30 days')::int AS users30
      FROM paywall_hits`.catch(() => [{ d7: 0n, d30: 0n, users30: 0n }]);
    const paywallByFeature = await prisma.$queryRaw<{ feature: string; hits: bigint; users: bigint }[]>`
      SELECT feature, COUNT(*)::int AS hits, COUNT(DISTINCT "userId")::int AS users
      FROM paywall_hits WHERE "createdAt" >= now() - interval '30 days'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`.catch(() => [] as { feature: string; hits: bigint; users: bigint }[]);
    // --- COHORT SEMANAL (18/10): com base nova (~16 signups/sem), mês é grosso demais. ---
    const weeklyCohort = await prisma.$queryRaw<{ wk: string; signups: bigint; activated: bigint; usedAi: bigint; retained7: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('week', u."createdAt"), 'MM-DD') AS wk,
             COUNT(*)::int AS signups,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM patients p JOIN exams e ON e."patientId"=p.id AND e.status='EXTRACTED' WHERE p."ownerId"=u.id))::int AS activated,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM credit_transactions t WHERE t."userId"=u.id AND t.delta<0 AND t.kind LIKE 'ai%'))::int AS used_ai,
             COUNT(*) FILTER (WHERE u."lastActiveDay" >= TO_CHAR(u."createdAt" + interval '7 days','YYYY-MM-DD'))::int AS retained7
      FROM users u
      WHERE u."role"='OWNER' AND COALESCE(u."isTest", false)=false AND u."createdAt" >= now() - interval '84 days'
      GROUP BY 1 ORDER BY MIN(u."createdAt") DESC LIMIT 12`.catch(() => [] as { wk: string; signups: bigint; activated: bigint; usedAi: bigint; retained7: bigint }[]);
    // --- ORIGEM DO CADASTRO (18/10): de onde vêm os signups (UTM/referrer no register). ---
    const acquisition = await prisma.$queryRaw<{ src: string; n: bigint }[]>`
      SELECT COALESCE(NULLIF("acquisitionSource",''),'(direto)') AS src, COUNT(*)::int AS n
      FROM users WHERE "role"='OWNER' AND COALESCE("isTest", false)=false
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`.catch(() => [] as { src: string; n: bigint }[]);
    res.json({
      funnel: { signups, verified, freeActive, premiumActive, conversionPct: verified ? Math.round((premiumActive / verified) * 1000) / 10 : 0 },
      revenue: { mrr: Math.round(premiumActive * getMonthlyPlan().price * 100) / 100, total: Math.round((agg._sum.amount ?? 0) * 100) / 100, monthlyPayments, creditPurchases },
      churn: { everPremium, stillActive, churned, renewals, retentionPct: everPremium ? Math.round((stillActive / everPremium) * 1000) / 10 : 0 },
      cohort: cohort.map((r) => ({ month: r.month, signups: Number(r.signups), converted: Number(r.converted) })).filter((r) => r.month),
      revenueByMonth: revenueByMonth.map((r) => ({ month: r.month, amount: Number(r.amount) })).filter((r) => r.month),
      paywall: {
        hits7d: Number(paywallTotals[0]?.d7 ?? 0), hits30d: Number(paywallTotals[0]?.d30 ?? 0), users30d: Number(paywallTotals[0]?.users30 ?? 0),
        byFeature: paywallByFeature.map((r) => ({ feature: r.feature, hits: Number(r.hits), users: Number(r.users) })),
      },
      weeklyCohort: weeklyCohort.map((r) => ({ week: r.wk, signups: Number(r.signups), activated: Number(r.activated), usedAi: Number(r.usedAi), retained7: Number(r.retained7) })),
      acquisition: acquisition.map((r) => ({ source: r.src, count: Number(r.n) })),
    });
  } catch (e) { next(e); }
});

// USABILIDADE — visão global de adoção de features (28/09, pedido do dono): funil de ativação
// (signup → verificado → 1º exame → usou IA → premium), atividade recente e, POR FEATURE, quem
// usa (contagem + % da base verificada) e os últimos 5 usuários (e-mail + data, mais recente
// primeiro). Tudo DERIVADO dos dados já gravados (sem nova telemetria); Libras agora é espelho
// server (users.librasEnabled). Tabelas novas são drift-safe (P2021 → 0, tema some).
router.get('/feature-usage', async (_req, res, next) => {
  try {
    const now = new Date();
    const dayStr = (d: Date) => d.toISOString().slice(0, 10);
    const d7 = dayStr(new Date(now.getTime() - 6 * 86400000));
    const d30 = dayStr(new Date(now.getTime() - 29 * 86400000));

    // --- FUNIL DE ATIVAÇÃO ---
    const [signups, verified, firstExamR, usedAiR, premiumActive, active7, active30] = await Promise.all([
      prisma.user.count({ where: { role: 'OWNER' } }),
      prisma.user.count({ where: { role: 'OWNER', emailVerified: true } }),
      prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(DISTINCT p."ownerId")::int AS cnt FROM patients p JOIN exams e ON e."patientId" = p.id AND e.status = 'EXTRACTED'`,
      prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(DISTINCT "userId")::int AS cnt FROM ai_usage_logs WHERE "userId" IS NOT NULL`,
      prisma.user.count({ where: { role: 'OWNER', planExpiresAt: { gt: now } } }),
      prisma.user.count({ where: { role: 'OWNER', lastActiveDay: { gte: d7 } } }),
      prisma.user.count({ where: { role: 'OWNER', lastActiveDay: { gte: d30 } } }),
    ]);

    // --- POR FEATURE: contagem distinta + últimos 5 (e-mail, quando) ---
    type FeatRow = { cnt: bigint | number; last: Date | null };
    type RecRow = { email: string; name: string; at: Date };
    const scalar = (r: FeatRow[]) => ({ users: Number(r[0]?.cnt ?? 0), lastAt: r[0]?.last ?? null });
    const recent = (r: RecRow[]) => r.map((x) => ({ email: x.email, name: x.name, at: x.at }));

    const [meds, medsRec, reminders, remRec, expMed, expMedRec, expAll, hc, hcRec, cons, consRec, chat, chatRec, summ, summRec, deps, depsRec, trials, trialsRec] = await Promise.all([
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT p."ownerId")::int AS cnt, MAX(m."createdAt") AS last FROM medications m JOIN patients p ON p.id = m."patientId"`,
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, m."createdAt" AS at FROM medications m JOIN patients p ON p.id = m."patientId" JOIN users u ON u.id = p."ownerId" ORDER BY m."createdAt" DESC LIMIT 5`,
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT p."ownerId")::int AS cnt, MAX(r."createdAt") AS last FROM reminders r JOIN patients p ON p.id = r."patientId"`,
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, r."createdAt" AS at FROM reminders r JOIN patients p ON p.id = r."patientId" JOIN users u ON u.id = p."ownerId" ORDER BY r."createdAt" DESC LIMIT 5`,
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT p."ownerId")::int AS cnt, MAX(x."createdAt") AS last FROM expenses x JOIN patients p ON p.id = x."patientId" WHERE x.category = 'Remédio'`,
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, x."createdAt" AS at FROM expenses x JOIN patients p ON p.id = x."patientId" JOIN users u ON u.id = p."ownerId" WHERE x.category = 'Remédio' ORDER BY x."createdAt" DESC LIMIT 5`,
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT x."ownerId")::int AS cnt, MAX(x."createdAt") AS last FROM expenses x`,
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT p."ownerId")::int AS cnt, MAX(mm."measuredAt") AS last FROM measurements mm JOIN patients p ON p.id = mm."patientId" WHERE mm.note = 'Health Connect'`,
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, mm."measuredAt" AS at FROM measurements mm JOIN patients p ON p.id = mm."patientId" JOIN users u ON u.id = p."ownerId" WHERE mm.note = 'Health Connect' ORDER BY mm."measuredAt" DESC LIMIT 5`,
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT l."userId")::int AS cnt, MAX(l."createdAt") AS last FROM ai_usage_logs l WHERE l.feature = 'CONSOLIDATED' AND l."userId" IS NOT NULL`,
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, l."createdAt" AS at FROM ai_usage_logs l JOIN users u ON u.id = l."userId" WHERE l.feature = 'CONSOLIDATED' ORDER BY l."createdAt" DESC LIMIT 5`,
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT l."userId")::int AS cnt, MAX(l."createdAt") AS last FROM ai_usage_logs l WHERE l.feature = 'CHAT' AND l."userId" IS NOT NULL`,
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, l."createdAt" AS at FROM ai_usage_logs l JOIN users u ON u.id = l."userId" WHERE l.feature = 'CHAT' ORDER BY l."createdAt" DESC LIMIT 5`,
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT l."userId")::int AS cnt, MAX(l."createdAt") AS last FROM ai_usage_logs l WHERE l.feature = 'SUMMARY' AND l."userId" IS NOT NULL`,
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, l."createdAt" AS at FROM ai_usage_logs l JOIN users u ON u.id = l."userId" WHERE l.feature = 'SUMMARY' ORDER BY l."createdAt" DESC LIMIT 5`,
      // Dependentes: patients com relationship informada ≠ Titular (o OWNER da linha é quem adicionou)
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT p."ownerId")::int AS cnt, MAX(p."createdAt") AS last FROM patients p WHERE p.relationship IS NOT NULL AND p.relationship <> '' AND p.relationship <> 'Titular'`,
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, p."createdAt" AS at FROM patients p JOIN users u ON u.id = p."ownerId" WHERE p.relationship IS NOT NULL AND p.relationship <> '' AND p.relationship <> 'Titular' ORDER BY p."createdAt" DESC LIMIT 5`,
      // Saúde mental (tabela nova — drift-safe)
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(DISTINCT p."ownerId")::int AS cnt, MAX(s."createdAt") AS last FROM mental_health_screenings s JOIN patients p ON p.id = s."patientId"`.catch(() => [{ cnt: 0, last: null }] as FeatRow[]),
      prisma.$queryRaw<RecRow[]>`SELECT u.email, u.name, s."createdAt" AS at FROM mental_health_screenings s JOIN patients p ON p.id = s."patientId" JOIN users u ON u.id = p."ownerId" ORDER BY s."createdAt" DESC LIMIT 5`.catch(() => [] as RecRow[]),
    ]);

    // Libras e Indicações (MGM)
    const [libras, librasRec, refs, refsRec] = await Promise.all([
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(*)::int AS cnt, NULL::timestamp AS last FROM users WHERE "librasEnabled" = true`.catch(() => [{ cnt: 0, last: null }] as FeatRow[]),
      prisma.$queryRaw<RecRow[]>`SELECT email, name, "createdAt" AS at FROM users WHERE "librasEnabled" = true ORDER BY "createdAt" DESC LIMIT 5`.catch(() => [] as RecRow[]),
      prisma.$queryRaw<FeatRow[]>`SELECT COUNT(*)::int AS cnt, MAX("createdAt") AS last FROM users WHERE "referredBy" IS NOT NULL AND "referredBy" <> ''`.catch(() => [{ cnt: 0, last: null }] as FeatRow[]),
      prisma.$queryRaw<RecRow[]>`SELECT email, name, "createdAt" AS at FROM users WHERE "referredBy" IS NOT NULL AND "referredBy" <> '' ORDER BY "createdAt" DESC LIMIT 5`.catch(() => [] as RecRow[]),
    ]);

    const base = verified || 1;
    const mkFeature = (key: string, label: string, f: { users: number; lastAt: Date | null }, rec: RecRow[] | { email: string; name: string; at: Date }[]) => ({
      key, label, users: f.users, pct: Math.round((f.users / base) * 1000) / 10, lastAt: f.lastAt,
      recent: (rec as any[]).map((x) => ({ email: x.email, name: x.name, at: x.at })),
    });

    res.json({
      funnel: {
        signups, verified,
        firstExam: Number(firstExamR[0]?.cnt ?? 0),
        usedAI: Number(usedAiR[0]?.cnt ?? 0),
        premium: premiumActive,
      },
      activity: { active7, active30 },
      features: [
        mkFeature('indicacoes', 'Veio por indicação (MGM)', scalar(refs), recent(refsRec)),
        mkFeature('medicacoes', 'Cadastrou remédios', scalar(meds), recent(medsRec)),
        mkFeature('lembretes', 'Usa lembretes', scalar(reminders), recent(remRec)),
        mkFeature('gastos-remedios', 'Lançou gasto de remédio', scalar(expMed), recent(expMedRec)),
        mkFeature('gastos', 'Usa gastos (qualquer)', scalar(expAll), []),
        mkFeature('health-connect', 'Health Connect conectado', scalar(hc), recent(hcRec)),
        mkFeature('relatorio', 'Usou relatório completo', scalar(cons), recent(consRec)),
        mkFeature('chat', 'Usou o chat de IA', scalar(chat), recent(chatRec)),
        mkFeature('resumo', 'Gerou resumo de exame', scalar(summ), recent(summRec)),
        mkFeature('dependentes', 'Adicionou dependente', scalar(deps), recent(depsRec)),
        mkFeature('saude-mental', 'Respondeu PHQ-9/GAD-7', scalar(trials), recent(trialsRec)),
        mkFeature('libras', 'Libras ativada', scalar(libras), recent(librasRec)),
      ],
    });
  } catch (e) { next(e); }
});

// INDICAÇÕES / REFERRALS — Gestão completa do programa "Indique e Ganhe"
router.get('/referrals', async (_req, res, next) => {
  try {
    const now = new Date();
    const [totalReferred, verifiedReferred, premiumReferred, withExamsR, bonusTotalR, topReferrersRaw, recentReferralsRaw] = await Promise.all([
      prisma.user.count({ where: { referredBy: { not: null } } }),
      prisma.user.count({ where: { referredBy: { not: null }, emailVerified: true } }),
      prisma.user.count({ where: { referredBy: { not: null }, planExpiresAt: { gt: now } } }),
      prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(DISTINCT u.id)::int as cnt
        FROM users u
        JOIN patients p ON p."ownerId" = u.id
        JOIN exams e ON e."patientId" = p.id
        WHERE u."referredBy" IS NOT NULL AND u."referredBy" <> ''
      `.catch(() => [{ cnt: BigInt(0) }]),
      prisma.creditTransaction.aggregate({
        where: { kind: 'referral' },
        _sum: { delta: true },
      }).catch(() => ({ _sum: { delta: 0 } })),
      // Top promotores ordenados por volume de indicações
      prisma.$queryRaw<{ referralCode: string; count: bigint }[]>`
        SELECT "referredBy" as "referralCode", COUNT(*)::bigint as count
        FROM users
        WHERE "referredBy" IS NOT NULL AND "referredBy" <> ''
        GROUP BY "referredBy"
        ORDER BY count DESC
        LIMIT 15
      `.catch(() => []),
      // Últimos 30 usuários que entraram via código de indicação
      prisma.user.findMany({
        where: { referredBy: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          emailVerified: true,
          referredBy: true,
          planExpiresAt: true,
          credits: true,
          patients: {
            select: {
              _count: { select: { exams: true } },
            },
          },
        },
      }),
    ]);

    // Resgata dados dos padrinhos do top 15
    const topCodes = topReferrersRaw.map((r) => r.referralCode).filter(Boolean);
    const referrersUsers = topCodes.length
      ? await prisma.user.findMany({
          where: { referralCode: { in: topCodes } },
          select: { id: true, name: true, email: true, referralCode: true, credits: true },
        })
      : [];
    const referrersMap = new Map(referrersUsers.map((u) => [u.referralCode, u]));

    const topReferrers = topReferrersRaw.map((r) => {
      const u = referrersMap.get(r.referralCode);
      return {
        referralCode: r.referralCode,
        count: Number(r.count),
        userName: u?.name || 'Usuário',
        userEmail: u?.email || '—',
        userCredits: u?.credits ?? 0,
      };
    });

    // Padrinhos da lista de recentes
    const recentCodes = [...new Set(recentReferralsRaw.map((r) => r.referredBy!).filter(Boolean))];
    const recentReferrersUsers = recentCodes.length
      ? await prisma.user.findMany({
          where: { referralCode: { in: recentCodes } },
          select: { id: true, name: true, email: true, referralCode: true },
        })
      : [];
    const recentMap = new Map(recentReferrersUsers.map((u) => [u.referralCode, u]));

    const recent = recentReferralsRaw.map((u) => {
      const ref = u.referredBy ? recentMap.get(u.referredBy) : null;
      const examCount = u.patients?.reduce((acc, p) => acc + (p._count?.exams || 0), 0) || 0;
      return {
        id: u.id,
        name: u.name || 'Sem nome',
        email: u.email,
        createdAt: u.createdAt,
        emailVerified: !!u.emailVerified,
        isPremium: u.planExpiresAt ? new Date(u.planExpiresAt) > now : false,
        examCount,
        credits: u.credits,
        referredByCode: u.referredBy,
        referrerName: ref?.name || `Código ${u.referredBy}`,
        referrerEmail: ref?.email || '—',
      };
    });

    const withExams = Number(withExamsR[0]?.cnt ?? 0);
    const totalBonus = Number(bonusTotalR?._sum?.delta ?? 0);

    res.json({
      stats: {
        totalReferred,
        verifiedReferred,
        withExams,
        premiumReferred,
        totalBonus,
        conversionRate: totalReferred > 0 ? Math.round((verifiedReferred / totalReferred) * 1000) / 10 : 0,
        examRate: verifiedReferred > 0 ? Math.round((withExams / verifiedReferred) * 1000) / 10 : 0,
      },
      topReferrers,
      recent,
    });
  } catch (e) { next(e); }
});

// DETALHE DO PROMOTOR — Lista todos os indicados por um código específico
router.get('/referrals/promoter/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code).trim();
    if (!code) { res.status(400).json({ error: 'Código de indicação é obrigatório.' }); return; }

    const now = new Date();
    const promoter = await prisma.user.findFirst({
      where: { referralCode: code },
      select: { id: true, name: true, email: true, referralCode: true, credits: true, role: true, createdAt: true },
    });

    const invitees = await prisma.user.findMany({
      where: { referredBy: code },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        emailVerified: true,
        planExpiresAt: true,
        credits: true,
        patients: {
          select: {
            _count: { select: { exams: true } },
          },
        },
      },
    });

    const list = invitees.map((u) => {
      const examCount = u.patients?.reduce((acc, p) => acc + (p._count?.exams || 0), 0) || 0;
      return {
        id: u.id,
        name: u.name || 'Sem nome',
        email: u.email,
        createdAt: u.createdAt,
        emailVerified: !!u.emailVerified,
        isPremium: u.planExpiresAt ? new Date(u.planExpiresAt) > now : false,
        examCount,
        credits: u.credits,
      };
    });

    res.json({
      promoter: promoter || { referralCode: code, name: 'Desconhecido', email: '—', credits: 0 },
      totalInvitees: list.length,
      verifiedCount: list.filter((i) => i.emailVerified).length,
      withExamsCount: list.filter((i) => i.examCount > 0).length,
      premiumCount: list.filter((i) => i.isPremium).length,
      invitees: list,
    });
  } catch (e) { next(e); }
});

// CONCEDER BÔNUS / CRÉDITOS AO PROMOTOR OU INDICADO
router.post('/referrals/award-bonus', async (req: AuthedRequest, res, next) => {
  try {
    const { userId, delta, reason } = req.body ?? {};
    const amount = Number(delta);
    if (!userId || isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'userId e valor positivo (delta) são obrigatórios.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, credits: true, name: true } });
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado.' }); return; }

    const label = reason ? String(reason).trim() : 'Bônus de indicação concedido pelo admin';
    // Concede DE VERDADE: incrementa o saldo + grava o extrato (logCredit só loga —
    // usado sozinho o "bônus" não creditava nada e a resposta vinha credits: undefined).
    const newBalance = (user.credits ?? 0) + amount;
    await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: amount } } });
    await logCredit(user.id, amount, 'referral', label);
    // audit aceita before/after (any) — delta/label vão aí dentro (TS2353 do build Docker).
    void audit('AWARD_REFERRAL_BONUS', req, { targetType: 'USER', targetId: user.id, after: { credits: newBalance, delta: amount, label } });

    res.json({ ok: true, credits: newBalance, added: amount, user: { id: user.id, name: user.name } });
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
// Body: { title, body, route? }. Merge fields {{nome}}/{{streak}}/{{passosOntem}} são
// resolvidos POR USUÁRIO no dispatch (dispatchToUsers) — antes o template ia cru e o
// usuário recebia "{{nome}}" literal (bug 10/26). Firebase Admin precisa estar
// configurado (service account) — senão conta a audiência mas não entrega.
router.post('/push/global', async (req: AuthedRequest, res, next) => {
  try {
    const title = String(req.body?.title ?? '').trim();
    const body = String(req.body?.body ?? '').trim();
    const route = req.body?.route ? String(req.body.route) : undefined;
    if (!title || !body) { res.status(400).json({ error: 'title e body são obrigatórios' }); return; }
    // Broadcast deliberado (sem cap anti-spam), mas nunca pra conta bloqueada.
    const tokens = await prisma.deviceToken.findMany({ select: { userId: true } });
    const ids = [...new Set(tokens.map((t) => t.userId))];
    // sendPushToUser (1-a-1) cria a Notification IN-APP (central/sino) E o push FCM,
    // com o texto interpolado por usuário.
    const { sent } = await dispatchToUsers(ids, { title, body, route, type: 'global' });
    // Registra como campanha (histórico no backoffice).
    await prisma.pushCampaign.create({ data: { name: title.slice(0, 60), title, body, route: route ?? null, sentAt: new Date(), sentCount: sent, createdBy: req.userId ?? null } }).catch(() => {});
    console.log(`[admin] push global enviado por ${req.userId}: "${title}" → ${sent} usuário(s)`);
    res.json({ ok: true, sent, topic: PUSH_TOPIC });
  } catch (e) { next(e); }
});

// PUSH SEGMENTADO — campanhas por público-alvo (plano/engajamento/exames/atividade HC).
// Filtro sanitizado em parseAudienceFilter; interseção entre grupos; merge fields
// {{nome}}/{{streak}}/{{passosOntem}} resolvidos por usuário no dispatch.
// Body: { title, body, route?, filter?, scheduledAt? } — scheduledAt futuro agenda
// (PushCampaign com sentAt null; o scheduler jobs/pushCampaigns dispara).
router.post('/push/audience-preview', async (req: AuthedRequest, res, next) => {
  try {
    const filter = parseAudienceFilter(req.body?.filter);
    const ids = await resolveAudienceUserIds(filter);
    const [devices, totalRegistered] = await Promise.all([
      ids.length ? prisma.deviceToken.count({ where: { userId: { in: ids } } }) : 0,
      prisma.user.count({ where: { blocked: false } }),
    ]);
    const response: { users: number; devices: number; totalRegistered: number; sampleUsers?: any[] } = {
      users: ids.length,
      devices,
      totalRegistered,
    };
    if (req.body?.includeUsers && ids.length) {
      const usersData = await prisma.user.findMany({
        where: { id: { in: ids.slice(0, 50) } },
        select: {
          id: true,
          name: true,
          email: true,
          planExpiresAt: true,
          deviceTokens: { select: { platform: true } },
        },
      });
      response.sampleUsers = usersData.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        planExpiresAt: u.planExpiresAt,
        deviceCount: u.deviceTokens.length,
        platforms: Array.from(new Set(u.deviceTokens.map((d) => d.platform).filter(Boolean))) as string[],
      }));
    }
    res.json(response);
  } catch (e) { next(e); }
});

router.post('/push/campaign', async (req: AuthedRequest, res, next) => {
  try {
    const title = String(req.body?.title ?? '').trim();
    const body = String(req.body?.body ?? '').trim();
    const route = req.body?.route ? String(req.body.route) : undefined;
    const filter = parseAudienceFilter(req.body?.filter);
    if (!title || !body) { res.status(400).json({ error: 'title e body são obrigatórios' }); return; }
    if (!Object.keys(filter).length) { res.status(400).json({ error: 'Escolha ao menos um público (para todos, use o push global).' }); return; }
    const scheduledAt = req.body?.scheduledAt ? new Date(String(req.body.scheduledAt)) : null;
    if (scheduledAt && (!scheduledAt.getTime() || Number.isNaN(scheduledAt.getTime()))) { res.status(400).json({ error: 'scheduledAt inválido' }); return; }

    if (scheduledAt && scheduledAt.getTime() > Date.now() + 60000) {
      const campaign = await prisma.pushCampaign.create({
        data: { name: title.slice(0, 60), title, body, route: route ?? null, audienceFilter: filter as object, scheduledAt, createdBy: req.userId ?? null },
      });
      console.log(`[admin] push campaign AGENDADA por ${req.userId} p/ ${scheduledAt.toISOString()}: "${title}"`);
      res.status(201).json({ ok: true, scheduled: true, campaignId: campaign.id, at: scheduledAt.toISOString() });
      return;
    }

    const { sent } = await dispatchCampaign({ title, body, route, filter });
    await prisma.pushCampaign.create({
      data: { name: title.slice(0, 60), title, body, route: route ?? null, audienceFilter: filter as object, sentAt: new Date(), sentCount: sent, createdBy: req.userId ?? null },
    }).catch(() => {});
    console.log(`[admin] push campaign enviada por ${req.userId}: "${title}" → ${sent} usuário(s)`);
    res.json({ ok: true, sent });
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
    // await (não void): o teste lê o auditLog logo após a resposta — fire-and-forget
    // perdia a corrida no runner lento do CI (mesma família do flake DOCTOR_REVIEW_UPSERTED).
    await audit('RESET_MFA', req, { targetType: 'USER', targetId: id, after: { mfaEnabled: false, resetBy: 'admin' } });
    console.log(`[admin] MFA resetado para ${user.email} (${id}) por ${req.userId}`);
    res.json({ ok: true, mfaEnabled: false, message: `MFA desativado para ${user.name || user.email}. Ele pode logar com senha e reconfigurar.` });
  } catch (e) { next(e); }
});

// ===== BACKOFFICE — endpoints read-only dos novos módulos (todos atrás de requireAdmin) =====

// MÉDICOS — lista CRM/UF + validação e-mail + pacientes compartilhados ativos + status de bloqueio.
router.get('/doctors', async (_req, res, next) => {
  try {
    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          name: true,
          crm: true,
          crmUf: true,
          specialty: true,
          email: true,
          emailVerified: true,
          photoUrl: true,
          createdAt: true,
          blocked: true,
          blockedAt: true,
          blockedReason: true,
          _count: { select: { shares: { where: { active: true } } } },
        },
      }),
      prisma.doctor.count(),
    ]);
    res.json({ doctors, total });
  } catch (e) { next(e); }
});

// Bloquear médico (suspensão de acesso ao portal e teleconsultas)
router.post('/doctors/:id/block', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const reason = req.body?.reason ? String(req.body.reason).trim() : null;
    const doctor = await prisma.doctor.update({
      where: { id },
      data: {
        blocked: true,
        blockedAt: new Date(),
        blockedReason: reason,
      },
      select: { id: true, name: true, crm: true, blocked: true, blockedAt: true, blockedReason: true },
    });
    void audit('ADMIN_BLOCK_DOCTOR', req, {
      targetType: 'DOCTOR',
      targetId: id,
      after: { blocked: true, reason, crm: doctor.crm },
    });
    res.json({ ok: true, doctor });
  } catch (e) { next(e); }
});

// Desbloquear médico (restaura acesso ao portal)
router.post('/doctors/:id/unblock', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const doctor = await prisma.doctor.update({
      where: { id },
      data: {
        blocked: false,
        blockedAt: null,
        blockedReason: null,
      },
      select: { id: true, name: true, crm: true, blocked: true, blockedAt: true, blockedReason: true },
    });
    void audit('ADMIN_UNBLOCK_DOCTOR', req, {
      targetType: 'DOCTOR',
      targetId: id,
      after: { blocked: false, crm: doctor.crm },
    });
    res.json({ ok: true, doctor });
  } catch (e) { next(e); }
});

// EXAMES — lista (filtro ?status= e ?search= opcionais) + contagem por status + recentes com falha.
router.get('/exams', async (req, res, next) => {
  try {
    const status = String(req.query.status ?? '').trim();
    const search = String(req.query.search ?? '').trim();

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { patient: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [exams, byStatus, recentFailed] = await Promise.all([
      prisma.exam.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 150,
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          performedAt: true,
          createdAt: true,
          extractionError: true,
          failureKind: true,
          rawExtraction: true,
          patientId: true,
          pageCount: true,
          fileSizeBytes: true,
          _count: { select: { items: true } },
          patient: {
            select: {
              id: true,
              fullName: true,
              // Dono 26/10: foto do paciente na lista de exames do admin (photoUrlFor
              // no client gera a URL autenticada; sem foto → iniciais no Avatar).
              photoUrl: true,
              // HOTFIX 26/10 (500 no prod): select pedia owner.phone — campo NÃO
              // existe no model User (validação do Prisma derruba a rota INTEIRA).
              // Telefone de contato de paciente não modelado; admin usa e-mail.
              owner: { select: { id: true, email: true } },
            },
          },
        },
      }),
      prisma.exam.groupBy({ by: ['status'], _count: true }),
      prisma.exam.findMany({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          extractionError: true,
          failureKind: true,
          rawExtraction: true,
          createdAt: true,
          patient: { select: { fullName: true } },
        },
      }),
    ]);
    res.json({ exams, byStatus, recentFailed });
  } catch (e) { next(e); }
});

// ADMIN: salvar diagnóstico / feedback de falha em exame
router.patch('/exams/:id/failure-feedback', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { failureKind, failureReason, adminNotes } = req.body || {};

    const existing = await prisma.exam.findUnique({
      where: { id },
      select: { id: true, rawExtraction: true, failureKind: true, status: true },
    });
    if (!existing) return res.status(404).json({ error: 'Exame não encontrado' });

    const raw = (typeof existing.rawExtraction === 'object' && existing.rawExtraction !== null)
      ? (existing.rawExtraction as Record<string, any>)
      : {};

    // fix 26/10: `req.user` não existe em AuthedRequest (é userId) — email do admin
    // revisor vem do banco (best-effort; sem userId = 'admin').
    const reviewer = req.userId
      ? ((await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } }))?.email ?? 'admin')
      : 'admin';

    const updatedRaw = {
      ...raw,
      adminReview: {
        failureReason: failureReason || null,
        adminNotes: adminNotes || null,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewer,
      },
    };

    const updated = await prisma.exam.update({
      where: { id },
      data: {
        failureKind: failureKind || existing.failureKind,
        rawExtraction: updatedRaw,
      },
      select: {
        id: true,
        failureKind: true,
        rawExtraction: true,
      },
    });

    await audit('EXAM_FAILURE_FEEDBACK', req, {
      targetType: 'EXAM',
      targetId: id,
      after: { failureKind, failureReason, adminNotes },
    });

    res.json({ ok: true, exam: updated });
  } catch (e) { next(e); }
});

// ADMIN: reprocessar extração de exame
router.post('/exams/:id/reprocess', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const exam = await prisma.exam.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!exam) return res.status(404).json({ error: 'Exame não encontrado' });

    await prisma.exam.update({
      where: { id },
      data: { status: 'EXTRACTING', extractionError: null },
    });

    runExtraction(exam.id).catch((e) => console.error('[admin:reprocess] extração falhou:', e?.message));

    await audit('REPROCESS_EXAM', req, {
      targetType: 'EXAM',
      targetId: id,
    });

    res.json({ ok: true, id: exam.id, status: 'EXTRACTING' });
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
    const userSearch = (q.userId || q.search || '').trim();
    if (userSearch) {
      const [matchedUsers, matchedDoctors] = await Promise.all([
        prisma.user.findMany({
          where: { OR: [{ id: userSearch }, { email: { contains: userSearch, mode: 'insensitive' } }, { name: { contains: userSearch, mode: 'insensitive' } }] },
          select: { id: true },
          take: 50,
        }).catch(() => []),
        prisma.doctor.findMany({
          where: { OR: [{ id: userSearch }, { email: { contains: userSearch, mode: 'insensitive' } }, { name: { contains: userSearch, mode: 'insensitive' } }] },
          select: { id: true },
          take: 50,
        }).catch(() => []),
      ]);
      const ids = [...new Set([userSearch, ...matchedUsers.map((u) => u.id), ...matchedDoctors.map((d) => d.id)])];
      conds.push({ OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] });
    }
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
  } catch (e) {
    next(e);
  }
});

// FEEDBACKS DE TELECONSULTA — monitoramento da qualidade do atendimento e satisfação do paciente/médico
router.get('/teleconsultas/feedbacks', async (req: AuthedRequest, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { action: 'TELECONSULTA_FEEDBACK' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const reminderIds = Array.from(new Set(logs.map((l) => l.targetId).filter(Boolean))) as string[];
    const reminders = reminderIds.length
      ? await prisma.reminder.findMany({
          where: { id: { in: reminderIds } },
          select: {
            id: true,
            title: true,
            dueDate: true,
            patientId: true,
            createdByDoctorId: true,
            endedAt: true,
          },
        })
      : [];

    const reminderMap = new Map(reminders.map((r) => [r.id, r]));
    const patientIds = Array.from(new Set(reminders.map((r) => r.patientId).filter(Boolean))) as string[];
    const doctorIds = Array.from(new Set(reminders.map((r) => r.createdByDoctorId).filter(Boolean))) as string[];

    const [patients, doctors] = await Promise.all([
      patientIds.length
        ? prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, fullName: true, photoUrl: true } })
        : [],
      doctorIds.length
        ? prisma.doctor.findMany({ where: { id: { in: doctorIds } }, select: { id: true, name: true, specialty: true, crm: true, crmUf: true, photoUrl: true } })
        : [],
    ]);

    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const doctorMap = new Map(doctors.map((d) => [d.id, d]));

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    // T1 insights (27/10): CSAT de áudio pós-consulta — agregado simples por valor.
    const audioQualityCounts: Record<'otimo' | 'ok' | 'ruim', number> = { otimo: 0, ok: 0, ruim: 0 };
    let sum = 0;

    const items = logs.map((l) => {
      const fb: any = l.after ?? {};
      const ratingRaw = Number(fb.rating);
      const rating = ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : 5;
      if (ratingRaw >= 1 && ratingRaw <= 5) {
        counts[rating] = (counts[rating] || 0) + 1;
        sum += rating;
      }
      const audioQuality = typeof fb.audioQuality === 'string' && fb.audioQuality in audioQualityCounts
        ? (fb.audioQuality as 'otimo' | 'ok' | 'ruim')
        : null;
      if (audioQuality) audioQualityCounts[audioQuality] += 1;
      const rem = l.targetId ? reminderMap.get(l.targetId) : null;
      const pat = rem?.patientId ? patientMap.get(rem.patientId) : null;
      const doc = rem?.createdByDoctorId ? doctorMap.get(rem.createdByDoctorId) : null;

      return {
        id: l.id,
        teleId: l.targetId,
        createdAt: l.createdAt,
        rating,
        audioQuality,
        note: fb.note || null,
        role: fb.role || (l.actorType === 'DOCTOR' ? 'doctor' : 'patient'),
        patient: pat ? { id: pat.id, name: pat.fullName, photoUrl: pat.photoUrl } : null,
        doctor: doc ? { id: doc.id, name: doc.name, specialty: doc.specialty, crm: doc.crm ? `${doc.crm}${doc.crmUf ? `/${doc.crmUf}` : ''}` : null, photoUrl: doc.photoUrl } : null,
        reminder: rem ? { title: rem.title, dueDate: rem.dueDate, endedAt: rem.endedAt } : null,
      };
    });

    const total = items.length;
    const avgRating = total > 0 ? Number((sum / total).toFixed(1)) : 5.0;
    const positiveCount = (counts[4] || 0) + (counts[5] || 0);
    const positivePct = total > 0 ? Math.round((positiveCount / total) * 100) : 100;

    res.json({
      total,
      avgRating,
      positivePct,
      ratingCounts: counts,
      audioQualityCounts,
      audioRated: audioQualityCounts.otimo + audioQualityCounts.ok + audioQualityCounts.ruim,
      items,
    });
  } catch (e) {
    next(e);
  }
});

// FUNIL DE TELECONSULTA — do agendamento à chamada real: realizadas (JOIN dos 2
// papéis, ou endedAt com join), no-show (vencida +24h sem chamada), pendentes,
// duração média (endedAt − 1º join, só das realizadas), retorno em 30d e % consent.
router.get('/teleconsultas/funnel', async (req: AuthedRequest, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query?.days) || 30));
    const windowStart = new Date(Date.now() - days * 86_400_000);
    const now = Date.now();

    // Agendadas na janela (createdAt = momento do agendamento). Select mínimo.
    const rows = await prisma.reminder.findMany({
      where: { type: 'teleconsulta', createdAt: { gte: windowStart } },
      select: { id: true, patientId: true, dueDate: true, consentAt: true, endedAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Joins reais das teleconsultas da janela (audit TELECONSULTA_JOIN).
    const ids = rows.map((r) => r.id);
    const joins = ids.length
      ? await prisma.auditLog.findMany({
          where: { action: 'TELECONSULTA_JOIN', targetId: { in: ids } },
          select: { targetId: true, createdAt: true, after: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    // Por teleconsulta: papéis distintos que entraram + instante do 1º join.
    const rolesByTele = new Map<string, Set<string>>();
    const firstJoinMs = new Map<string, number>();
    for (const j of joins) {
      const tid = j.targetId ?? '';
      if (!tid) continue;
      const role = String((j.after as any)?.role ?? '');
      if (role) {
        let roles = rolesByTele.get(tid);
        if (!roles) {
          roles = new Set();
          rolesByTele.set(tid, roles);
        }
        roles.add(role);
      }
      // orderBy asc → primeira ocorrência por teleconsulta é o 1º join
      if (!firstJoinMs.has(tid)) firstJoinMs.set(tid, new Date(j.createdAt).getTime());
    }

    let realizadas = 0;
    let noShow = 0;
    let pendentes = 0;
    let consentCount = 0;
    let durationSumMin = 0;
    let durationCount = 0;
    const realizadasByPatient = new Map<string, Date[]>();

    for (const r of rows) {
      const roles = rolesByTele.get(r.id);
      const joined = (roles?.size ?? 0) > 0;
      const bothRoles = (roles?.size ?? 0) >= 2;
      const isRealizada = bothRoles || (r.endedAt != null && joined);

      if (r.consentAt != null) consentCount++;
      if (isRealizada) {
        realizadas++;
        if (r.patientId) {
          const list = realizadasByPatient.get(r.patientId) ?? [];
          list.push(new Date(r.dueDate));
          realizadasByPatient.set(r.patientId, list);
        }
        const firstJoin = firstJoinMs.get(r.id);
        if (r.endedAt && firstJoin != null) {
          const min = (new Date(r.endedAt).getTime() - firstJoin) / 60_000;
          if (min > 0) {
            durationSumMin += min;
            durationCount++;
          }
        }
      } else if (new Date(r.dueDate).getTime() + 86_400_000 < now) {
        noShow++; // vencida +24h sem JOIN dos 2 papéis
      } else {
        pendentes++; // futura, ou com menos de 24h do horário marcado
      }
    }

    // Retorno 30d: paciente com ≥2 realizadas e volta dentro de 30d da anterior.
    let retorno30d = 0;
    for (const dates of realizadasByPatient.values()) {
      dates.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < dates.length; i++) {
        if (dates[i].getTime() - dates[i - 1].getTime() <= 30 * 86_400_000) {
          retorno30d++;
          break;
        }
      }
    }

    const total = rows.length;
    res.json({
      days,
      total,
      realizadas,
      noShow,
      pendentes,
      realizacaoPct: total > 0 ? Math.round((realizadas / total) * 100) : 0,
      avgDurationMin: durationCount > 0 ? Number((durationSumMin / durationCount).toFixed(1)) : null,
      retorno30d,
      consentPct: total > 0 ? Math.round((consentCount / total) * 100) : 0,
    });
  } catch (e) {
    next(e);
  }
});

// ══════════════════════════════════════════════════════════════════════════════════
// ONDA 2 — §18.2 CONFIG COMERCIAL DE COMISSÕES (24/10). Decisões D1-D9 pendentes →
// defaults são HIPÓTESES editáveis (nunca número mágico no código). Histórico é
// APPEND-ONLY: criar nova vigência encerra automaticamente a anterior (validTo=now).
// O snapshot congelado em cada agendamento garante que mudança NUNCA recalcula o
// passado (§15.3) — editar regra aqui só afeta AGENDAMENTOS FUTUROS.
// ══════════════════════════════════════════════════════════════════════════════════

// Histórico completo (geral doctorId=null + específicas), p/ o admin ver vigências.
router.get('/commission-rules', async (_req, res, next) => {
  try {
    const rules = await prisma.commissionRule.findMany({
      orderBy: [{ doctorId: { sort: 'asc', nulls: 'first' } }, { validFrom: 'desc' }],
    }).catch(() => []); // drift-safe: tabela nova ausente em banco legado
    // Regra vigente por escopo p/ leitura rápida da UI (resolução é no agendamento).
    const now = new Date();
    const vigente = (doctorId: string | null) =>
      rules.find((r: any) => r.doctorId === doctorId && r.validFrom <= now && (r.validTo == null || r.validTo > now)) ?? null;
    res.json({
      rules,
      active: { general: vigente(null), defaults: DEFAULT_COMMISSION_RULE },
    });
  } catch (e) { next(e); }
});

// Nova vigência (PUT semântico: sempre CRIA regra; a anterior é encerrada na hora —
// histórico nunca é editado/apagado). doctorId opcional = regra específica.
router.post('/commission-rules', async (req: AuthedRequest, res, next) => {
  try {
    const doctorId = req.body?.doctorId != null ? String(req.body.doctorId) : null;
    const platformBps = Number(req.body?.platformBps ?? DEFAULT_COMMISSION_RULE.platformBps);
    const feeBearer = req.body?.feeBearer === 'doctor' ? 'doctor' : 'platform';
    const releaseDelayDays = Number(req.body?.releaseDelayDays ?? DEFAULT_COMMISSION_RULE.releaseDelayDays);
    const minPayoutCents = Number(req.body?.minPayoutCents ?? DEFAULT_COMMISSION_RULE.minPayoutCents);
    if (!Number.isInteger(platformBps) || platformBps < 0 || platformBps > 10_000) {
      res.status(400).json({ error: 'platformBps deve ser inteiro entre 0 e 10000 (20% = 2000).' }); return;
    }
    if (!Number.isInteger(releaseDelayDays) || releaseDelayDays < 0 || releaseDelayDays > 90) {
      res.status(400).json({ error: 'releaseDelayDays deve ser inteiro entre 0 e 90.' }); return;
    }
    if (!Number.isInteger(minPayoutCents) || minPayoutCents < 0) {
      res.status(400).json({ error: 'minPayoutCents deve ser inteiro ≥ 0 (centavos).' }); return;
    }
    if (doctorId) {
      const doc = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true } });
      if (!doc) { res.status(400).json({ error: 'Médico não encontrado.' }); return; }
    }
    const now = new Date();
    const rule = await prisma.$transaction(async (tx) => {
      // Encerra TODAS as vigências abertas deste escopo (geral ou do médico) que já
      // começaram — regra futura agendada (validFrom > now) permanece intocada.
      const closed = await tx.commissionRule.updateMany({
        where: {
          ...(doctorId ? { doctorId } : { doctorId: null }),
          validTo: null,
          validFrom: { lte: now },
        },
        data: { validTo: now },
      });
      const created = await tx.commissionRule.create({
        data: { doctorId, platformBps, feeBearer, releaseDelayDays, minPayoutCents, validFrom: now },
      });
      return { created, closedCount: closed.count };
    });
    await audit('ADMIN_COMMISSION_RULE_CREATE', req, {
      targetType: 'COMMISSION_RULE', targetId: rule.created.id,
      before: { closedRules: rule.closedCount },
      after: { ...rule.created, validFrom: rule.created.validFrom.toISOString(), createdAt: undefined },
    });
    console.log(`[admin] regra de comissão ${doctorId ? `médico ${doctorId}` : 'GERAL'} criada: ${platformBps}bps, feeBearer=${feeBearer}, D+${releaseDelayDays} (${rule.closedCount} encerrada(s))`);
    res.status(201).json({ rule: rule.created, closedRules: rule.closedCount });
  } catch (e) { next(e); }
});

// ADMIN: encerrar regra específica de médico (ele volta a seguir a regra geral)
router.delete('/commission-rules/doctor/:doctorId', async (req: AuthedRequest, res, next) => {
  try {
    const doctorId = String(req.params.doctorId);
    const now = new Date();
    const closed = await prisma.commissionRule.updateMany({
      where: {
        doctorId,
        validTo: null,
        validFrom: { lte: now },
      },
      data: { validTo: now },
    });
    await audit('ADMIN_COMMISSION_RULE_RESET_DOCTOR', req, {
      targetType: 'COMMISSION_RULE',
      targetId: doctorId,
      after: { closedRules: closed.count },
    });
    res.json({ ok: true, closedRules: closed.count });
  } catch (e) { next(e); }
});


// ═════════════════════════════════════════════════════════════════════════════════
// ONDA 3 — §18.8 VISÃO FINANCEIRA ADMIN (24/10/26). Leitura do ledger da onda 2.
// Período = data do EVENTO financeiro (createdAt do lançamento). Caixa Asaas e
// conciliação automática ficam p/ onda 4 (caixaAsaasCents/ultimaConciliacao = null —
// declarado na UI, nunca zero falso).
// Margem de contribuição = receita da plataforma LÍQUIDA (feeBearer=platform já
// desconta a taxa da própria receita na conclusão; feeBearer=doctor tira do médico)
// → margem = platform_revenue net. ≠ lucro líquido (caption obrigatória na UI).
// ═════════════════════════════════════════════════════════════════════════════════
/** ONDA 4 (dono 26/10 — "faz o estorno e amarra essa jornada"): estorno EXECUTADO de
 *  teleconsulta paga. Admin clica → chama o Asaas (POST /v3/payments/:id/refund) →
 *  marca refundedAt + encerra a consulta se ainda aberta → escritura o ledger
 *  (postRefundExecuted: consome reserva ou retenção → conta refund) → avisa paciente
 *  (push+e-mail) e médico (e-mail). Idempotente pelo refundedAt. Falha no Asaas NÃO
 *  marca NADA no sistema (dinheiro é real — só escreve quem CONFIRMOU o provider). */
router.post('/teleconsulta/:id/refund', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const r = await prisma.reminder.findFirst({
      where: { id, type: 'teleconsulta' },
      select: { id: true, ownerId: true, patientId: true, createdByDoctorId: true, dueDate: true, title: true, paidAt: true, paymentRef: true, refundedAt: true, consultPriceCents: true, endedAt: true, teleStatus: true },
    });
    if (!r) { res.status(404).json({ error: 'Teleconsulta não encontrada.' }); return; }
    if (!r.paidAt || !r.paymentRef) { res.status(400).json({ error: 'Esta consulta não tem pagamento confirmado.', code: 'NO_PAYMENT' }); return; }
    if (r.refundedAt) { res.status(409).json({ error: 'Esta consulta já foi estornada.', code: 'ALREADY_REFUNDED', refundedAt: r.refundedAt.toISOString() }); return; }
    if (!hasAsaas()) { res.status(503).json({ error: 'Asaas não configurado neste servidor.' }); return; }

    // EXECUTA no provider — dinheiro de verdade: só escreve no sistema se o Asaas aceitar.
    // BASE = saldo REAL retido (com a taxa lançada na ENTRADA — modelo 26/10 — o held
    // vale o líquido e o estorno dele é integral-de-verdade). Pagamento legado sem
    // taxa lançada → held = bruto → DEGRAU: recusado por saldo → estorna o LÍQUIDO do
    // payment (netValue). Em ambos os modelos a carteira sempre cobre o que entrou.
    const heldAgg = await prisma.ledgerEntry.aggregate({
      where: { reminderId: r.id, account: 'held_unrealized' },
      _sum: { creditCents: true, debitCents: true },
    }).catch(() => ({ _sum: { creditCents: 0, debitCents: 0 } }));
    const heldNet = Math.max(0, (heldAgg._sum.creditCents ?? 0) - (heldAgg._sum.debitCents ?? 0));
    const refundBase = heldNet > 0 ? heldNet : r.consultPriceCents!;
    const asaasHeaders = { access_token: config.asaasApiKey, 'Content-Type': 'application/json' };
    const postRefund = (valueCents: number) =>
      fetch(`${config.asaasApiBaseUrl}/v3/payments/${encodeURIComponent(r.paymentRef!)}/refund`, {
        method: 'POST', headers: asaasHeaders,
        body: JSON.stringify({ value: Number((valueCents / 100).toFixed(2)) }),
      }).catch(() => null);
    const refundErrText = async (res: Response | null) => {
      const b: any = res ? await res.json().catch(() => null) : null;
      return { status: res?.status ?? 0, detail: String(b?.errors?.[0]?.description ?? '') };
    };

    let asaasRes = await postRefund(refundBase);
    let refundedValueCents = refundBase;
    if (!asaasRes || !asaasRes.ok) {
      const first = await refundErrText(asaasRes);
      // Busca o LÍQUIDO real da cobrança (entrou = devolvível sem saldo extra).
      const payRes = await fetch(`${config.asaasApiBaseUrl}/v3/payments/${encodeURIComponent(r.paymentRef!)}`, { headers: asaasHeaders }).catch(() => null);
      const pay: any = payRes && payRes.ok ? await payRes.json().catch(() => null) : null;
      const netCents = Math.round(Number(pay?.netValue ?? 0) * 100);
      if (/saldo/i.test(first.detail) && netCents > 0 && netCents < refundBase) {
        asaasRes = await postRefund(netCents);
        if (asaasRes && asaasRes.ok) {
          refundedValueCents = netCents;
          console.log(`[refund] base recusada (saldo) — estorno PARCIAL do líquido: ${(netCents / 100).toFixed(2)} de ${(refundBase / 100).toFixed(2)} (${r.paymentRef})`);
        }
      }
      if (!asaasRes || !asaasRes.ok) {
        const second = asaasRes ? await refundErrText(asaasRes) : first;
        const detail = second.detail || first.detail || null;
        console.error('[refund] Asaas recusou o estorno:', r.paymentRef, second.status || first.status, JSON.stringify(detail).slice(0, 300));
        const isSaldo = /saldo/i.test(detail ?? '');
        res.status(502).json({
          error: isSaldo
            ? 'Saldo insuficiente na carteira Asaas (a tarifa do PIX não é devolvida pelo provedor). Adicione saldo à carteira e tente de novo.'
            : 'O Asaas recusou o estorno — nada foi alterado no sistema.',
          code: 'PROVIDER_REFUSED',
          detail,
        });
        return;
      }
    }

    const refundedAt = new Date();
    const feeCents = r.consultPriceCents! - refundedValueCents; // parcial = tarifa não-devolvida
    await prisma.reminder.update({
      where: { id: r.id },
      // Consulta ABERTA (scheduled) que foi estornada = cancelada por devolução.
      data: { refundedAt, ...(r.endedAt ? {} : { endedAt: refundedAt, done: true, teleStatus: 'cancelled' }) },
    });
    const posted = await postRefundExecuted(r.id, refundedValueCents).catch((e: any) => {
      console.error('[refund] ledger do estorno falhou (conciliação repara):', r.id, e?.message);
      return null;
    });
    // Taxa explícita SÓ quando não foi lançada na ENTRADA (pagamento legado sem
    // netValue): fecha o held no ponto morto. Modelo novo já lançou no pagamento.
    if (feeCents > 0) {
      const alreadyFee = await prisma.ledgerEntry.aggregate({
        where: { reminderId: r.id, account: 'provider_fees' },
        _sum: { creditCents: true },
      }).catch(() => ({ _sum: { creditCents: 0 } }));
      if (!((alreadyFee._sum.creditCents ?? 0) >= feeCents)) {
        await postEntries([{
          txnId: `refund_fee_${r.id}`,
          reminderId: r.id, doctorId: r.createdByDoctorId,
          memo: 'Tarifa do provedor não devolvida no estorno (Asaas)',
          ruleSnapshot: {},
          entries: [
            { account: 'held_unrealized', debitCents: r.consultPriceCents! - (alreadyFee._sum.creditCents ?? 0) - refundedValueCents, refType: 'reminder', refId: r.id },
            { account: 'provider_fees', creditCents: r.consultPriceCents! - (alreadyFee._sum.creditCents ?? 0) - refundedValueCents, refType: 'reminder', refId: r.id },
          ],
        }]).catch((e: any) => console.error('[refund] ledger da taxa falhou:', r.id, e?.message));
      }
    }
    void notifyTeleconsultaRefunded(r, refundedValueCents, feeCents).catch(() => {});
    console.log(`[refund] teleconsulta ${r.id} estornada — ${r.paymentRef} (${(refundedValueCents / 100).toFixed(2)} BRL de ${(r.consultPriceCents! / 100).toFixed(2)}, ledger ${posted?.posted ? 'ok' : 'pendente conciliação'})`);
    res.json({ ok: true, refundedAt: refundedAt.toISOString(), refundedValueCents, feeCents, partial: feeCents > 0, ledger: { posted: posted?.posted ?? false, entries: posted?.entries ?? 0 } });
  } catch (e) { next(e); }
});

/** Lista de consultas PAGAS p/ o painel de estorno (dono 26/10): quem pagou, quanto,
 *  status e se já foi devolvida — 1 clique estorna (rota /refund acima). */
router.get('/teleconsulta/paid', async (req: AuthedRequest, res, next) => {
  try {
    const rows = await prisma.reminder.findMany({
      where: { type: 'teleconsulta', paidAt: { not: null } },
      orderBy: { paidAt: 'desc' },
      take: 120,
      select: {
        id: true, title: true, dueDate: true, paidAt: true, paymentRef: true, refundedAt: true,
        consultPriceCents: true, teleStatus: true, endedAt: true, noShowBy: true,
        patient: { select: { fullName: true } },
        createdByDoctorId: true,
      },
    }).catch(() => []);
    const docIds = [...new Set(rows.map((r: any) => r.createdByDoctorId).filter(Boolean))];
    const docs = docIds.length
      ? await prisma.doctor.findMany({ where: { id: { in: docIds as string[] } }, select: { id: true, name: true } }).catch(() => [] as { id: string; name: string }[])
      : [];
    const docMap = Object.fromEntries(docs.map((d) => [d.id, d.name]));
    res.json({
      items: rows.map((r: any) => ({
        id: r.id, title: r.title, dueDate: r.dueDate, paidAt: r.paidAt, refundedAt: r.refundedAt,
        priceCents: r.consultPriceCents, teleStatus: r.teleStatus, endedAt: r.endedAt, noShowBy: r.noShowBy,
        paymentRef: r.paymentRef,
        patientName: r.patient?.fullName ?? '—',
        doctorName: r.createdByDoctorId ? docMap[r.createdByDoctorId] ?? null : null,
      })),
    });
  } catch (e) { next(e); }
});

router.get('/finance/overview', async (req: AuthedRequest, res, next) => {
  try {
    const now = new Date();
    const parse = (v: unknown): Date | null => {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
      const d = new Date(v.trim() + 'T12:00:00');
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const from = parse(req.query.from) ?? new Date(now.getTime() - 30 * 86_400_000);
    const to = new Date(parse(req.query.to) ?? now);
    to.setHours(23, 59, 59, 999);
    const doctorId = typeof req.query.doctorId === 'string' && req.query.doctorId.trim() ? req.query.doctorId.trim() : null;

    // Filtro por médico: lançamentos ligados às teleconsultas DELE (toda linha do
    // ledger de teleconsulta carrega reminderId; doctor_payable também doctorId).
    let reminderIds: string[] | null = null;
    if (doctorId) {
      const rems = await prisma.reminder.findMany({ where: { createdByDoctorId: doctorId, type: 'teleconsulta' }, select: { id: true }, take: 5000 }).catch(() => []);
      reminderIds = rems.map((r) => r.id);
    }
    const baseWhere = {
      createdAt: { gte: from, lte: to },
      ...(reminderIds ? { OR: [{ reminderId: { in: reminderIds } }, { account: 'doctor_payable', doctorId: doctorId! }] } : {}),
    };
    const agg = async (account: string) => {
      const a = await prisma.ledgerEntry.aggregate({
        where: { ...baseWhere, account },
        _sum: { debitCents: true, creditCents: true },
      }).catch(() => ({ _sum: { debitCents: 0, creditCents: 0 } }));
      return { debitCents: a._sum.debitCents ?? 0, creditCents: a._sum.creditCents ?? 0, netCents: (a._sum.creditCents ?? 0) - (a._sum.debitCents ?? 0) };
    };
    const [patientReceived, reserve, doctorPayable, platformRevenue, providerFees, refund] = await Promise.all([
      agg('patient_received'), agg('reserve'), agg('doctor_payable'), agg('platform_revenue'), agg('provider_fees'), agg('refund'),
    ]);

    // Série diária (volume recebido + receita da plataforma) — agrupada em JS p/
    // ficar drift-safe (sem raw SQL de date_trunc).
    const serieRows = await prisma.ledgerEntry.findMany({
      where: { ...baseWhere, account: { in: ['patient_received', 'platform_revenue'] } },
      select: { account: true, debitCents: true, creditCents: true, createdAt: true },
      take: 20000,
      orderBy: { createdAt: 'asc' },
    }).catch(() => [] as { account: string; debitCents: number; creditCents: number; createdAt: Date }[]);
    const byDay = new Map<string, { volumeCents: number; receitaCents: number }>();
    for (const e of serieRows) {
      const day = e.createdAt.toISOString().slice(0, 10);
      const cur = byDay.get(day) ?? { volumeCents: 0, receitaCents: 0 };
      if (e.account === 'patient_received') cur.volumeCents += e.debitCents;
      if (e.account === 'platform_revenue') cur.receitaCents += e.creditCents;
      byDay.set(day, cur);
    }
    const seriePorDia = Array.from(byDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([dia, v]) => ({ dia, ...v }));

    // Divergências financeiras abertas (ExceptionQueue — triagem humana §18.3).
    const [divergenciasAbertas, divergencias] = await Promise.all([
      prisma.exceptionQueue.count({ where: { kind: { startsWith: 'teleconsulta_finance' }, status: 'open' } }).catch(() => 0),
      prisma.exceptionQueue.findMany({
        where: { kind: { startsWith: 'teleconsulta_finance' }, status: 'open' },
        orderBy: { createdAt: 'desc' }, take: 20,
        select: { id: true, kind: true, reminderId: true, createdAt: true },
      }).catch(() => [] as { id: string; kind: string; reminderId: string | null; createdAt: Date }[]),
    ]);

    // Caixa Asaas REAL (GET /v3/finance/balance, cache 5min — onda 4 §18.8).
    // Sem key / falha → null: a UI mostra "—", nunca R$ 0,00 falso.
    const caixaAsaasCents = await getAsaasBalanceCached(Date.now()).catch(() => null);
    const lastRec = getLastReconciliationAt();

    res.json({
      periodo: { from: from.toISOString(), to: to.toISOString() },
      doctorId,
      volumeBrutoCents: patientReceived.debitCents, // total pago por pacientes (GMV — NÃO é receita)
      aDevolverCents: reserve.netCents, // reservado p/ estorno ainda não executado
      devolvidosCents: refund.netCents, // já devolvido (executado)
      obrigacoesMedicosCents: doctorPayable.netCents, // a repassar (honorários)
      receitaPlataformaCents: platformRevenue.netCents,
      taxasCents: providerFees.netCents,
      margemContribuicaoCents: platformRevenue.netCents, // ver comentário do bloco — ≠ lucro líquido
      caixaAsaasCents,
      divergenciasAbertas,
      divergencias: divergencias.map((d) => ({ id: d.id, kind: d.kind, reminderId: d.reminderId, createdAt: d.createdAt.toISOString() })),
      seriePorDia,
      ultimaConciliacao: lastRec ? new Date(lastRec).toISOString() : null,
    });
  } catch (e) { next(e); }
});

// ═════════════════════════════════════════════════════════════════════════════════
// ONDA 4 — §18.5/§18.6 REPASSES SUPERVISIONADOS (24/10/26). O job cria Payouts
// `requested` (reserva atômica no ledger); o ENVIO é daqui (aprovação admin —
// chamada REAL ao Asaas /v3/transfers, externalReference=payout_<id>). Auto é
// GATED por AppSetting teleconsulta.payoutAuto (default OFF — decisão do dono).
// PIX do médico NUNCA sai completo: resposta e audit carregam MASCARADA.
// ═════════════════════════════════════════════════════════════════════════════════

router.get('/payouts', async (req: AuthedRequest, res, next) => {
  try {
    const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;
    const payouts = await prisma.payout.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
      take: 100,
    }).catch(() => []);
    const doctorIds = [...new Set(payouts.map((p: any) => p.doctorId))];
    const doctors = doctorIds.length
      ? await prisma.doctor.findMany({ where: { id: { in: doctorIds } }, select: { id: true, name: true, crm: true, payoutPixKeyEnc: true, payoutPixKeyIv: true, payoutPixKeyType: true } })
      : [];
    const reminders = payouts.length
      ? await prisma.reminder.findMany({
          where: { id: { in: payouts.map((p: any) => p.reminderId) } },
          select: { id: true, title: true, dueDate: true },
        })
      : [];
    const doctorById = new Map(doctors.map((d: any) => [d.id, d]));
    const reminderById = new Map(reminders.map((r: any) => [r.id, r]));
    res.json({
      auto: payoutAutoEnabled(), // toggle do dono (confirm + audit na UI)
      payouts: payouts.map((p: any) => {
        const d = doctorById.get(p.doctorId);
        const key = d?.payoutPixKeyEnc ? decryptPII(d.payoutPixKeyEnc, d.payoutPixKeyIv) : null;
        return {
          id: p.id, status: p.status, amountCents: p.amountCents,
          requestedAt: p.requestedAt.toISOString(), completedAt: p.completedAt?.toISOString() ?? null,
          lastError: p.lastError, attempts: p.attempts,
          doctor: d ? { id: d.id, name: d.name, crm: d.crm } : null,
          pixKeyMasked: key ? maskPixKey(key, d!.payoutPixKeyType) : null,
          pixKeyType: d?.payoutPixKeyType ?? null,
          reminder: (() => { const r = reminderById.get(p.reminderId); return r ? { id: r.id, title: r.title, dueDate: r.dueDate.toISOString() } : null; })(),
        };
      }),
    });
  } catch (e) { next(e); }
});

// APROVAÇÃO — o ÚNICO ponto com chamada de escrita real ao Asaas fora do auto-gated.
// Fluxo: valida requested+reserva → transfer PIX → DONE=completed / FAILED=failed
// (desreserva) / sem resposta=unknown (conciliação resolve; NUNCA reenvia).
router.post('/payouts/:id/approve', async (req: AuthedRequest, res, next) => {
  try {
    const payoutId = String(req.params.id);
    const payout = await prisma.payout.findUnique({ where: { id: payoutId } }).catch(() => null);
    if (!payout) { res.status(404).json({ error: 'Repasse não encontrado.' }); return; }
    const doctor = payout ? await prisma.doctor.findUnique({ where: { id: payout.doctorId }, select: { name: true, payoutPixKeyEnc: true, payoutPixKeyIv: true, payoutPixKeyType: true } }) : null;
    const key = doctor?.payoutPixKeyEnc ? decryptPII(doctor.payoutPixKeyEnc, doctor.payoutPixKeyIv) : null;
    const masked = key ? maskPixKey(key, doctor!.payoutPixKeyType) : null;
    await audit('ADMIN_PAYOUT_APPROVE_REQUEST', req, {
      targetType: 'PAYOUT', targetId: payoutId,
      before: { status: payout.status },
      after: { amountCents: payout.amountCents, pixKeyMasked: masked },
    });
    let outcome;
    try {
      outcome = await approvePayout(payoutId, { executor: `admin:${req.userId}` });
    } catch (e: any) {
      res.status(409).json({ error: e?.message ?? 'Aprovação recusada.' });
      return;
    }
    await audit('ADMIN_PAYOUT_APPROVE_RESULT', req, {
      targetType: 'PAYOUT', targetId: payoutId,
      after: { status: outcome.status, transferId: outcome.transferId, error: outcome.error ?? null },
    });
    console.log(`[admin] repasse ${payoutId} aprovado por ${req.userId}: ${outcome.status}`);
    res.json({ payout: { id: payoutId, status: outcome.status, transferId: outcome.transferId }, error: outcome.error ?? null });
  } catch (e) { next(e); }
});

// Toggle do modo AUTO (default OFF — §18.5 "implemente primeiro o supervisionado").
// Confirmação fica na UI; aqui registra audit do QUEM/ANTES/DEPOIS.
router.post('/payouts/auto', async (req: AuthedRequest, res, next) => {
  try {
    const enabled = req.body?.enabled === true || req.body?.enabled === 1 || req.body?.enabled === '1';
    const before = payoutAutoEnabled();
    await saveSettings('teleconsulta', { payoutAuto: enabled ? 1 : 0 });
    await audit('TELECONSULTA_PAYOUT_AUTO_TOGGLE', req, {
      targetType: 'APP_SETTING', targetId: 'teleconsulta.payoutAuto',
      before: { payoutAuto: before }, after: { payoutAuto: enabled },
    });
    console.log(`[admin] repasse automático ${enabled ? 'LIGADO' : 'DESLIGADO'} por ${req.userId}`);
    res.json({ auto: payoutAutoEnabled() });
  } catch (e) { next(e); }
});

// ===== CUPONS DE DESCONTO (T3 insights Conexa, 28/10/26) =====
// CRUD mínimo atrás do gate admin: criar, listar, desativar/ajustar. Sem seeds — o
// admin cria na mão (founder/indicação). Regras de validação/aplicação vivem em
// utils/coupons (o checkout SEMPRE revalida server-side).
router.get('/coupons', async (_req, res, next) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ coupons });
  } catch (e) { next(e); }
});

router.post('/coupons', async (req: AuthedRequest, res, next) => {
  try {
    const code = normalizeCouponCode(String(req.body?.code ?? ''));
    const kind = String(req.body?.kind ?? '');
    const value = Math.round(Number(req.body?.value));
    const appliesTo = String(req.body?.appliesTo ?? 'any');
    const maxUsesRaw = req.body?.maxUses;
    const maxUses = maxUsesRaw == null || maxUsesRaw === '' ? null : Math.round(Number(maxUsesRaw));
    const notes = req.body?.notes != null ? String(req.body?.notes).slice(0, 200) : null;
    const expiresRaw = req.body?.expiresAt;
    const expiresAt = expiresRaw ? new Date(String(expiresRaw)) : null;

    if (code.length < 2 || code.length > 32) { res.status(400).json({ error: 'Código inválido (2-32 caracteres A-Z/0-9).' }); return; }
    if (kind !== 'percent' && kind !== 'fixed_cents') { res.status(400).json({ error: 'kind deve ser percent ou fixed_cents.' }); return; }
    if (!Number.isFinite(value) || value <= 0 || (kind === 'percent' && value > 100)) {
      res.status(400).json({ error: kind === 'percent' ? 'Valor deve ser 1-100 (%).' : 'Valor deve ser > 0 (centavos).' });
      return;
    }
    if (!['any', 'plan_monthly', 'credits'].includes(appliesTo)) { res.status(400).json({ error: 'appliesTo inválido.' }); return; }
    if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 1)) { res.status(400).json({ error: 'maxUses deve ser ≥ 1 ou vazio (ilimitado).' }); return; }
    if (expiresAt && Number.isNaN(expiresAt.getTime())) { res.status(400).json({ error: 'Validade inválida.' }); return; }

    const exists = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
    if (exists) { res.status(409).json({ error: `Já existe um cupom com o código ${code}.` }); return; }

    const coupon = await prisma.coupon.create({ data: { code, kind, value, appliesTo, maxUses, expiresAt, notes, active: true } });
    await audit('ADMIN_COUPON_CREATE', req, { targetType: 'COUPON', targetId: coupon.id, after: { code, kind, value, appliesTo, maxUses, expiresAt: expiresAt?.toISOString() ?? null } });
    console.log(`[admin] cupom ${code} criado por ${req.userId}`);
    res.status(201).json({ coupon });
  } catch (e) { next(e); }
});

router.patch('/coupons/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id ?? '');
    const before = await prisma.coupon.findUnique({ where: { id } });
    if (!before) { res.status(404).json({ error: 'Cupom não encontrado.' }); return; }

    const data: Record<string, unknown> = {};
    if (req.body?.active != null) data.active = req.body.active === true || req.body.active === 1 || req.body.active === '1';
    if (req.body?.maxUses !== undefined) {
      const raw = req.body.maxUses;
      const maxUses = raw == null || raw === '' ? null : Math.round(Number(raw));
      if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 1)) { res.status(400).json({ error: 'maxUses deve ser ≥ 1 ou vazio (ilimitado).' }); return; }
      data.maxUses = maxUses;
    }
    if (req.body?.expiresAt !== undefined) {
      if (req.body.expiresAt == null || req.body.expiresAt === '') data.expiresAt = null;
      else {
        const d = new Date(String(req.body.expiresAt));
        if (Number.isNaN(d.getTime())) { res.status(400).json({ error: 'Validade inválida.' }); return; }
        data.expiresAt = d;
      }
    }
    if (req.body?.notes !== undefined) data.notes = req.body.notes == null ? null : String(req.body.notes).slice(0, 200);
    if (!Object.keys(data).length) { res.status(400).json({ error: 'Nada para atualizar.' }); return; }

    const coupon = await prisma.coupon.update({ where: { id }, data });
    await audit('ADMIN_COUPON_UPDATE', req, {
      targetType: 'COUPON', targetId: id,
      before: { active: before.active, maxUses: before.maxUses, expiresAt: before.expiresAt?.toISOString() ?? null },
      after: { active: coupon.active, maxUses: coupon.maxUses, expiresAt: coupon.expiresAt?.toISOString() ?? null },
    });
    res.json({ coupon });
  } catch (e) { next(e); }
});

export default router;
