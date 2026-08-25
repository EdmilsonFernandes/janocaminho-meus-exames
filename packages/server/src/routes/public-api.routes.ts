import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { requireApiKey, generateApiKey, hashKey, apiCallBalance, ApiKeyRequest } from '../middleware/apiKey';
import { logCredit } from '../utils/credits';
import { getSettings } from '../utils/settings';

/**
 * API PÚBLICA v1 (Fase 1 — monetização por API; ver /api/docs).
 * Princípios:
 *  - Só dado de VAREJO público (preço de remédio, catálogo, interações D/X) — zero dado de
 *    saúde pessoal. Interpretação de exames NÃO exposta (muralha do produto + ANVISA RDC 657).
 *  - Leitura do CACHE (catálogo/snapshot) — a API pública JAMAIS dispara busca live na fonte
 *    (protege a cota VTEX/Lomadee e garante latência previsível; o worker refresha sozinho).
 *  - Preço vem com flag `stale` honesta (snapshot > 6h) — quem consome decide se usa.
 */

const router = Router();

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

// ── INFO (sem key — descoberta) ─────────────────────────────────────────────
router.get('/', (_req, res) => {
  const st = getSettings().apiAccess ?? { freeMonthly: 25, packs: [] };
  res.json({
    name: 'Dr. Exame API',
    version: '1.1.0',
    docs: '/api/docs',
    howToAccess: '1) crie sua conta no app → 2) POST /access-request (empresa + caso de uso) → 3) aprovação libera o pacote TESTE grátis + criação de chaves → 4) recarregue com pacotes pré-pagos (PIX/cartão/débito)',
    freeTrial: { calls: st.freeMonthly },
    packs: (st.packs ?? []).map((p: any) => ({ id: p.id, calls: p.calls, price: p.price, label: p.label })),
    rateLimit: '60/min por chave',
    endpoints: ['/meds', '/meds/prices', '/meds/interactions'],
    disclaimer: 'Dado educativo de varejo farmacêutico. Não é recomendação médica.',
  });
});

// ── MEDS: busca no catálogo (nome/marca/princípio ativo) ────────────────────
router.get('/meds', requireApiKey, async (req: ApiKeyRequest, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) { res.status(400).json({ error: 'Parâmetro ?q= obrigatório (mín. 2 caracteres).' }); return; }
    const nq = norm(q);
    const entries = await prisma.medicationCatalogEntry.findMany({ take: 200 });
    const hits = entries
      .filter((e) => norm(`${e.name} ${(e.brands ?? []).join(' ')} ${e.activeIngredient}`).includes(nq))
      .slice(0, 20)
      .map((e) => ({
        name: e.name,
        activeIngredient: e.activeIngredient,
        brands: e.brands,
        doses: e.doses,
        photoUrl: e.photoUrl,
        bestPriceCents: e.priceCents,
        bestPharmacy: e.pharmacy,
        ean: e.ean,
        offersCount: e.offersCount,
        lastRefreshedAt: e.lastRefreshedAt,
      }));
    res.json({ query: q, count: hits.length, results: hits });
  } catch (e) { next(e); }
});

// ── MEDS/PRICES: snapshot de preços por princípio ativo (+dose opcional) ────
router.get('/meds/prices', requireApiKey, async (req: ApiKeyRequest, res, next) => {
  try {
    const ingredient = norm(String(req.query.ingredient ?? ''));
    const dose = String(req.query.dose ?? '').replace(',', '.').trim();
    const unit = norm(String(req.query.unit ?? ''));
    if (ingredient.length < 3) { res.status(400).json({ error: 'Parâmetro ?ingredient= obrigatório (nome/princípio ativo).' }); return; }
    // Chave do snapshot: "INGREDIENT|50MG|CP|30" — sem dose, casa qualquer apresentação.
    const prefix = dose ? `${ingredient}|${dose}${unit ? norm(unit) : 'MG'}|` : `${ingredient}|`;
    const snapshot = await prisma.medicationPriceSnapshot.findFirst({
      where: { medicationKey: { startsWith: prefix }, locationKey: 'BR' },
      orderBy: { collectedAt: 'desc' },
      include: { offers: { orderBy: { priceCents: 'asc' }, take: 12 } },
    });
    if (!snapshot) {
      res.status(404).json({ error: 'not_found', message: 'Sem snapshot de preço para este termo. Tente /meds para ver o catálogo disponível.' });
      return;
    }
    const staleHours = (Date.now() - snapshot.collectedAt.getTime()) / 3_600_000;
    res.json({
      medicationKey: snapshot.medicationKey,
      lowestPriceCents: snapshot.lowestPriceCents,
      averagePriceCents: snapshot.averagePriceCents,
      offersCount: snapshot.offersCount,
      stale: staleHours > 6, // honesto: passou de 6h da coleta
      collectedAt: snapshot.collectedAt,
      offers: snapshot.offers.map((o) => ({
        pharmacy: o.pharmacy, productName: o.productName, priceCents: o.priceCents,
        url: o.url, imageUrl: o.imageUrl, ean: o.ean, lastCheckedAt: o.lastCheckedAt,
      })),
    });
  } catch (e) { next(e); }
});

// ── MEDS/INTERACTIONS: pares D/X entre os remédios informados ───────────────
router.get('/meds/interactions', requireApiKey, async (req: ApiKeyRequest, res, next) => {
  try {
    const drugsParam = String(req.query.drugs ?? '');
    const includeAll = String(req.query.all ?? '') === '1';
    const drugs = drugsParam.split(',').map((d) => d.trim()).filter(Boolean).map(norm);
    if (drugs.length < 2) { res.status(400).json({ error: 'Parâmetro ?drugs= obrigatório (2+ nomes separados por vírgula).' }); return; }
    // Normaliza com o mesmo dicionário do app (aliases: LEVOID → LEVOTIROXINA).
    const { normDrug, ALIASES_PUBLIC } = await import('../utils/interactions');
    const canon = drugs.map((d) => {
      const n = normDrug(d.toLowerCase());
      return (ALIASES_PUBLIC as Record<string, string>)[n] ?? n;
    }).map((d) => d.toUpperCase());
    // Todos os pares únicos, em ordem alfabética (como as regras são armazenadas).
    const pairs: [string, string][] = [];
    for (let i = 0; i < canon.length; i++) {
      for (let j = i + 1; j < canon.length; j++) {
        pairs.push(canon[i] < canon[j] ? [canon[i], canon[j]] : [canon[j], canon[i]]);
      }
    }
    const rules = await prisma.interactionRule.findMany({
      where: { OR: pairs.map(([a, b]) => ({ drugA: a, drugB: b })) },
    });
    const relevant = includeAll ? rules : rules.filter((r) => r.severity === 'D' || r.severity === 'X');
    res.json({
      drugs: canon,
      checkedPairs: pairs.length,
      count: relevant.length,
      interactions: relevant
        .sort((a, b) => b.severity.localeCompare(a.severity))
        .map((r) => ({ drugA: r.drugA, drugB: r.drugB, severity: r.severity, effect: r.effect, recommendation: r.recommendation, source: r.source })),
      disclaimer: 'Informativo — nunca substitui a checagem do farmacêutico/médico.',
    });
  } catch (e) { next(e); }
});

// ── ACCESS REQUEST: dev pede, admin aprova (ou auto se reviewRequired=0) ────
router.post('/access-request', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const company = String(req.body?.company ?? '').trim();
    const useCase = String(req.body?.useCase ?? '').trim();
    if (company.length < 2 || useCase.length < 10) {
      res.status(400).json({ error: 'Informe a empresa/projeto e o caso de uso (mín. 10 caracteres).' });
      return;
    }
    const existing = await prisma.apiAccessRequest.findFirst({
      where: { userId: req.userId!, status: { in: ['pending', 'approved'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.status === 'approved') { res.status(409).json({ error: 'Acesso já aprovado — crie suas chaves em POST /keys.' }); return; }
    if (existing?.status === 'pending') { res.status(409).json({ error: 'Solicitação em análise — respondemos no e-mail da conta.' }); return; }
    const st = getSettings().apiAccess ?? { freeMonthly: 25, reviewRequired: 1 };
    const row = await prisma.apiAccessRequest.create({ data: { userId: req.userId!, company, useCase } });
    // Self-serve (admin desligou a revisão): aprova na hora e concede o teste grátis.
    if (Number(st.reviewRequired) === 0) {
      await prisma.apiAccessRequest.update({ where: { id: row.id }, data: { status: 'approved', reviewedAt: new Date(), note: 'Aprovação automática.' } });
      if (Number(st.freeMonthly) > 0) await logCredit(req.userId!, Number(st.freeMonthly), 'api_grant', 'Pacote teste da API (aprovação automática)');
      res.status(201).json({ id: row.id, status: 'approved', message: 'Acesso liberado — crie sua chave em POST /keys.' });
      return;
    }
    res.status(201).json({ id: row.id, status: 'pending', message: 'Solicitação recebida — analisamos e liberamos o pacote teste.' });
  } catch (e) { next(e); }
});

router.get('/access-request', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const row = await prisma.apiAccessRequest.findFirst({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' } });
    res.json(row ?? { status: 'none' });
  } catch (e) { next(e); }
});

// ── KEYS: gestão self-service (login normal do app, NÃO api-key) ────────────
router.post('/keys', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim() || 'Minha integração';
    // GATE (Fase 2): sem acesso aprovado não cria chave — o fluxo é solicitar → aprovar → testar → comprar.
    const st = getSettings().apiAccess ?? { reviewRequired: 1 };
    if (Number(st.reviewRequired) === 1) {
      const access = await prisma.apiAccessRequest.findFirst({ where: { userId: req.userId!, status: 'approved' }, orderBy: { createdAt: 'desc' } });
      if (!access) { res.status(403).json({ error: 'access_required', message: 'Solicite acesso à API primeiro (POST /access-request).' }); return; }
    }
    const count = await prisma.apiKey.count({ where: { userId: req.userId!, revokedAt: null } });
    if (count >= 5) { res.status(429).json({ error: 'Limite de 5 chaves ativas. Revogue uma antes de criar outra.' }); return; }
    const { key, hash, prefix } = generateApiKey();
    const row = await prisma.apiKey.create({ data: { userId: req.userId!, name, keyHash: hash, prefix } });
    // A chave completa aparece UMA VEZ — só o hash fica guardado.
    res.status(201).json({ id: row.id, name, key, prefix, createdAt: row.createdAt, warning: 'Guarde esta chave agora — ela não será exibida novamente.' });
  } catch (e) { next(e); }
});

router.get('/keys', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const rows = await prisma.apiKey.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
    const balance = await apiCallBalance(req.userId!);
    const access = await prisma.apiAccessRequest.findFirst({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' } });
    res.json({
      keys: rows,
      access: access ? { status: access.status, note: access.note } : { status: 'none' },
      balance: { calls: balance },
      packs: (getSettings().apiAccess?.packs ?? []).map((p: any) => ({ id: p.id, calls: p.calls, price: p.price, label: p.label, popular: p.popular })),
      buyEndpoint: '/api/billing/buy-api-pack',
    });
  } catch (e) { next(e); }
});

router.delete('/keys/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const row = await prisma.apiKey.findUnique({ where: { id: String(req.params.id) }, select: { id: true, userId: true, revokedAt: true } });
    if (!row || row.userId !== req.userId) { res.status(404).json({ error: 'Chave não encontrada.' }); return; }
    if (!row.revokedAt) await prisma.apiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    res.json({ ok: true, id: row.id, revokedAt: row.revokedAt ?? new Date().toISOString() });
  } catch (e) { next(e); }
});

export default router;
