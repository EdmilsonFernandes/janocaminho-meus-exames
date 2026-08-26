import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { requireApiKey, requireApiKeyCost, refundApiCall, generateApiKey, hashKey, apiCallBalance, ApiKeyRequest } from '../middleware/apiKey';
import { logCredit } from '../utils/credits';
import { getSettings } from '../utils/settings';
import { sendPushToUser } from '../utils/push';
import { sendEmail } from '../utils/mailer';
import { upload } from '../middleware/upload';
import { buildNormalizedMedication } from '../pricing/normalize';
import { extractLabPanels } from '../extraction/claude';
import { getActiveConfig } from '../llm/ai-config';

/** Aviso ao dono/suporte: nova solicitação de acesso à API (e-mail + push pros admins). */
async function notifyAdminsNewRequest(r: { company: string; useCase: string }, requester: { name?: string; email: string }) {
  const subject = `🔌 Nova solicitação de API — ${r.company}`;
  const text = `${requester.name ?? 'Usuário'} (${requester.email}) pediu acesso à API.\n\nEmpresa: ${r.company}\nCaso de uso: ${r.useCase}\n\nAprove em: /admin?tab=api`;
  void sendEmail({
    to: 'contato@janocaminho.com.br',
    subject,
    html: `<p><b>${requester.name ?? 'Usuário'}</b> (${requester.email}) pediu acesso à API.</p><p><b>Empresa:</b> ${r.company}<br/><b>Caso de uso:</b> ${r.useCase}</p><p>Aprove em <a href="https://drexame.janocaminho.com.br/admin?tab=api">Admin → API pública</a>.</p>`,
    text,
  }).catch(() => {});
  const adminRows = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  // AWAIT por admin (não void): a notificação in-app precisa existir ANTES da resposta —
  // fire-and-forget passava local e PERDIA A CORRIDA no CI (teste flakeava com undefined).
  for (const a of adminRows) {
    await sendPushToUser(a.id, subject, `${requester.email} · ${r.company} — avalie no admin`, { type: 'api_access' }).catch(() => {});
  }
}

/**
 * API PÚBLICA v1 (Fase 1 — monetização por API; ver /api/docs).
 * Princípios:
 *  - Dado de VAREJO público (preço, catálogo, interações D/X) + Motores do produto expostos
 *    como FERRAMENTA sobre dado ENVIADO PELO CLIENTE (extração/interpretação de laudo DELE):
 *    somos processador, nunca fonte — nada do nosso usuário sai, nada do cliente é guardado.
 *  - Leitura do CACHE (catálogo/snapshot) — a API pública JAMAIS dispara busca live na fonte
 *    (protege a cota VTEX/Lomadee e garante latência previsível; o worker refresha sozinho).
 *  - Preço vem com flag `stale` honesta (snapshot > 6h) — quem consome decide se usa.
 *  - Sempre educativo (ANVISA RDC 657): disclaimers em toda resposta de exame.
 */

const router = Router();

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

// ── INFO (sem key — descoberta) ─────────────────────────────────────────────
router.get('/', (_req, res) => {
  const st = getSettings().apiAccess ?? { freeMonthly: 25, packs: [] };
  res.json({
    name: 'Dr. Exame API',
    version: '1.2.0',
    docs: '/api/docs',
    howToAccess: '1) crie sua conta no app → 2) POST /access-request (empresa + caso de uso) → 3) aprovação libera o pacote TESTE grátis + criação de chaves → 4) recarregue com pacotes pré-pagos (PIX/cartão/débito)',
    freeTrial: { calls: st.freeMonthly },
    packs: (st.packs ?? []).map((p: any) => ({ id: p.id, calls: p.calls, price: p.price, label: p.label })),
    rateLimit: '60/min por chave',
    endpoints: ['/meds', '/meds/normalize', '/meds/prices', '/meds/interactions', '/exams/extract', '/exams/interpret'],
    pricing: { extractCostCalls: st.extractCostCalls ?? 20, note: `/exams/extract custa ${st.extractCostCalls ?? 20} chamadas (motor de IA). Demais endpoints: 1 chamada.` },
    disclaimer: 'Dado educativo de varejo farmacêutico e ferramentas de estruturação sobre documentos enviados pelo cliente. Não é recomendação médica.',
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

// ── MEDS/NORMALIZE: texto livre → chave canônica (o motor do app, exposto) ──
// "Dorflex Analgésico e Relaxante Muscular 10 comprimidos" → princípio ativo +
// dose + forma + pack + medicationKey — a chave que casa com /meds/prices.
router.post('/meds/normalize', requireApiKey, async (req: ApiKeyRequest, res, next) => {
  try {
    const text = String(req.body?.text ?? '').trim();
    if (text.length < 3) { res.status(400).json({ error: 'Campo { "text": "..." } obrigatório (mín. 3 caracteres).' }); return; }
    const { ALIASES_PUBLIC, normDrug } = await import('../utils/interactions');
    const raw = normDrug(text.toLowerCase());
    // Alias casa com a marca SECA ("levoid") — tenta o texto todo e a 1ª palavra
    // ("levoid 75mcg" → "levoid"), senão "levotirox 75" nunca acharia o dicionário.
    const aliasMap = ALIASES_PUBLIC as Record<string, string>;
    const aliasKey = [raw, raw.split(' ')[0]].find((k) => aliasMap[k]);
    const alias = aliasKey ? aliasMap[aliasKey] : null;
    // Se é marca pura (LEVOID), troca pelo CANÔNICO mantendo o resto do texto
    // (a dose vem junto: "Levoid 75mcg" → "LEVOTIROXINA 75mcg" — senão a key fica sem dose).
    const rest = aliasKey ? text.replace(new RegExp(aliasKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ') : text;
    const normalized = buildNormalizedMedication({ name: alias ? `${alias} ${rest}`.trim() : text, packQty: req.body?.packQty ?? null });
    const key = normalized.medicationKey;
    // Preço no nível INGREDIENTE (o /meds/prices também casa por prefixo) — embalagem
    // incompleta não impede: quem consome decide com o stale/collectedAt na mão.
    const withPrices = req.body?.includePrices === true && !!key;
    let prices: any = null;
    if (withPrices) {
      const snapshot = await prisma.medicationPriceSnapshot.findFirst({
        where: { medicationKey: { startsWith: `${key.split('|')[0]}|` }, locationKey: 'BR' },
        orderBy: { collectedAt: 'desc' },
        select: { lowestPriceCents: true, offersCount: true, collectedAt: true },
      });
      if (snapshot) prices = snapshot;
    }
    res.json({
      input: text,
      brandResolved: alias ? { from: aliasKey, to: alias } : null,
      activeIngredient: normalized.activeIngredient,
      dosage: normalized.dosageValue != null ? { value: normalized.dosageValue, unit: normalized.dosageUnit ?? null } : null,
      form: normalized.form ?? null,
      packQty: normalized.packQty ?? null,
      medicationKey: key,
      comparable: !!key && !key.endsWith('|?'), // sem dose/pack o preço não é comparável honestamente
      prices,
    });
  } catch (e) { next(e); }
});

// ── EXAMS/EXTRACT: laudo (PDF ou texto) do PRÓPRIO CLIENTE → JSON estruturado ─
// Custo PESADO (LLM real): settings.apiAccess.extractCostCalls chamadas por extração.
// multipart (campo file) OU JSON { "text": "..." }. Falha da IA → reembolso (sem cobrança).
router.post('/exams/extract', requireApiKeyCost(getSettings().apiAccess?.extractCostCalls ?? 20), upload.single('file'), async (req: ApiKeyRequest, res, next) => {
  const cost = getSettings().apiAccess?.extractCostCalls ?? 20;
  try {
    // VALIDAÇÃO DE ENTRADA PRIMEIRO (erro do cliente não depende do estado da IA):
    const file = req.file;
    const text = String(req.body?.text ?? '').trim();
    if (!file && text.length < 50) {
      await refundApiCall(req.apiUserId!, cost, 'payload inválido');
      res.status(400).json({ error: 'Envie o laudo como multipart (campo "file", PDF/imagem) OU JSON { "text": "..." } com o conteúdo do laudo (mín. 50 caracteres).' });
      return;
    }
    if (!getActiveConfig().apiKey) {
      await refundApiCall(req.apiUserId!, cost, 'IA indisponível');
      res.status(503).json({ error: 'ai_unavailable', message: 'Motor de extração indisponível no momento. Você não foi cobrado.' });
      return;
    }
    const buffer = file?.buffer ?? Buffer.from(text, 'utf8');
    const mediaType = file?.mimetype ?? 'text/plain';
    const exams = await extractLabPanels(buffer, mediaType, file ? undefined : text);
    const itemCount = exams.reduce((s, e) => s + (e.panels ?? []).reduce((s2, p) => s2 + (p.items ?? []).length, 0), 0);
    if (!itemCount) {
      await refundApiCall(req.apiUserId!, cost, 'nenhum item extraído');
      res.status(422).json({ error: 'extraction_empty', message: 'Não foi possível identificar itens de laboratório no documento. Você não foi cobrado.' });
      return;
    }
    // PII do documento do CLIENTE volta pra ELE (somos o processador, não a fonte) —
    // nunca persistimos nada: resposta only, zero gravação.
    res.json({
      exams: exams.map((e) => ({
        examTitle: e.examTitle ?? null,
        sourceLab: e.sourceLab ?? null,
        performedAt: e.performedAt ?? null,
        patientName: e.patientName ?? null,
        panels: e.panels ?? [],
      })),
      itemCount,
      charged: cost,
      disclaimer: 'Estruturação automática (IA) do documento ENVIADO POR VOCÊ. Confira os valores antes de qualquer uso clínico. Dado educativo — nunca diagnóstico (ANVISA RDC 657). Nada é armazenado por nós.',
    });
  } catch (e) {
    await refundApiCall(req.apiUserId!, cost, 'erro na extração');
    // Cliente recebe JSON honesto (não 500 cru): falhou a IA, não foi cobrado.
    console.warn('[public-api] extract falhou:', (e as Error).message?.slice(0, 140));
    res.status(502).json({ error: 'ai_error', message: 'A extração falhou (motor de IA). Você não foi cobrado — tente novamente.' });
  }
});

// ── EXAMS/INTERPRET: valor × faixa → flag/tom/rótulo (determinístico, sem IA) ─
// Espelha o motor de exibição do app (displayStatus): direção + GRAU (>20% além do
// limite = "Muito acima/abaixo"), LDL/não-HDL sinaliza contexto clínico, sem faixa
// nunca inventa rótulo. Quem envia a faixa é o caller (a faixa é do laudo DELE).
router.post('/exams/interpret', requireApiKey, async (req: ApiKeyRequest, res, next) => {
  try {
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length || items.length > 200) { res.status(400).json({ error: 'Envie { "items": [{ "name", "value", "refLow"?, "refHigh"? }, …] } (1-200 itens).' }); return; }
    const normKey = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const CONTEXT_DEPENDENT = ['LDL', 'NAO HDL', 'NON-HDL', 'NON HDL'];
    const out = items.map((it) => {
      const name = String(it?.name ?? '');
      const value = it?.value != null ? Number(it.value) : null;
      const low = it?.refLow != null ? Number(it.refLow) : null;
      const high = it?.refHigh != null ? Number(it.refHigh) : null;
      if (value == null || !Number.isFinite(value) || low == null || high == null || low === high) {
        const isCtx = CONTEXT_DEPENDENT.some((k) => normKey(name).includes(k));
        return {
          name, value, refLow: low, refHigh: high,
          flag: 'UNKNOWN',
          tone: isCtx ? 'contexto' : 'neutro',
          label: isCtx ? 'Interpretação depende do contexto clínico (metas por risco cardiovascular — SBC)' : 'Referência não informada pelo laboratório',
        };
      }
      if (value > high) {
        const severe = value > high * 1.2;
        return { name, value, refLow: low, refHigh: high, flag: 'HIGH', tone: severe ? 'critico' : 'atencao', label: severe ? 'Muito acima da referência' : 'Acima da referência' };
      }
      if (value < low) {
        const severe = value < low * 0.8;
        return { name, value, refLow: low, refHigh: high, flag: 'LOW', tone: severe ? 'critico' : 'atencao', label: severe ? 'Muito abaixo da referência' : 'Abaixo da referência' };
      }
      return { name, value, refLow: low, refHigh: high, flag: 'NORMAL', tone: 'normal', label: 'Dentro da referência' };
    });
    const summary = { total: out.length, altered: out.filter((o) => o.flag === 'HIGH' || o.flag === 'LOW').length, critical: out.filter((o) => o.tone === 'critico').length };
    res.json({
      items: out,
      summary,
      disclaimer: 'Comparação determinística valor × faixa ENVIADA POR VOCÊ. Educativo — nunca diagnóstico nem conduta clínica (ANVISA RDC 657).',
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
    const requester = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true, email: true } });
    // AWAIT (não void): a notificação do admin precisa existir na resposta (teste flakeava).
    if (requester) await notifyAdminsNewRequest({ company, useCase }, requester);
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
