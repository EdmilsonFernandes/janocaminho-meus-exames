import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';
import { chargeCredits, refundCredits, CREDIT_COSTS } from '../utils/credits';
import { matchInteractions, findUnmatched, isCritical, SEVERITY_LABEL, type InteractionHit } from '../utils/interactions';
import { upload } from '../middleware/upload';
import { buildNormalizedMedication } from '../pricing/normalize';
import { runPriceWorkerTick, processMedicationPrice } from '../pricing/worker';
import { ProviderRegistry } from '../pricing/provider';

/**
 * Remédios do paciente + checagem de interações A–X.
 *
 * Monetização (decisão do dono 2026-08-22): cadastro e alertas CRÍTICOS (D/X) são grátis
 * — segurança não se cobra. A checagem COMPLETA (todas as severidades + leitura
 * contextual da IA considerando os exames do paciente) consome créditos, como o chat.
 */

const router = Router();

// FARMÁCIAS ATIVAS (name + logo + cor) — PÚBLICO (antes do requireAuth de propósito):
// a landing usa os logos no mock do comparador sem login. Logos não são dado sensível.
router.get('/pharmacies', async (_req, res, next) => {
  try {
    const rows = await prisma.pharmacyConfig.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { name: true, logoUrl: true, color: true },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.use(requireAuth);

// LIST (por paciente; default = primeiro)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { start, take } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const where: any = { patientId: { in: pids } };
    if (q.patientId && pids.includes(q.patientId)) where.patientId = q.patientId;
    if (q.active != null) where.active = q.active === 'true';
    const [total, rows] = await prisma.$transaction([
      prisma.medication.count({ where }),
      prisma.medication.findMany({ where, skip: start, take, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    ]);
    // Resumo de preço por card (join batch — nunca 1 query por remédio). Inclui a FOTO
    // da oferta mais barata (pro card mostrar o produto, não só a inicial).
    // FALLBACK: snapshot expirado recente (≤6h, ex.: combobox de 5min que o worker
    // ainda vai enriquecer) continua no card com flag `stale` — preço de minutos
    // atrás é melhor que card apagado (bug Dorflex/Esomeprazol).
    const keys = rows.map((m) => m.nameNormalized).filter((k): k is string => !!k && !k.endsWith('|?'));
    const snaps = keys.length
      ? await prisma.medicationPriceSnapshot.findMany({
          where: { medicationKey: { in: keys }, locationKey: 'BR', collectedAt: { gt: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
          orderBy: { collectedAt: 'desc' },
          select: { medicationKey: true, lowestPriceCents: true, offersCount: true, collectedAt: true, expiresAt: true,
            offers: { orderBy: { priceCents: 'asc' }, take: 1, select: { imageUrl: true, pharmacy: true } } },
        })
      : [];
    const now = Date.now();
    const snapByKey = new Map<string, any>();
    for (const s of snaps) {
      if (s.lowestPriceCents == null) continue;
      const entry = {
        medicationKey: s.medicationKey, lowestPriceCents: s.lowestPriceCents, offersCount: s.offersCount,
        collectedAt: s.collectedAt, imageUrl: s.offers[0]?.imageUrl ?? null,
        pharmacy: s.offers[0]?.pharmacy ?? null, stale: s.expiresAt.getTime() <= now,
      };
      const cur = snapByKey.get(s.medicationKey);
      if (!cur || (cur.stale && !entry.stale)) snapByKey.set(s.medicationKey, entry); // fresco > expirado
    }
    setListHeaders(res, start, start + take, total);
    res.json(rows.map((m) => ({
      ...m,
      priceSummary: (m.nameNormalized && snapByKey.get(m.nameNormalized)) ?? null,
    })));
  } catch (e) { next(e); }
});

// CREATE — preço INSTANTÂNEO do catálogo (se tiver); worker só para quem NÃO está no catálogo
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, name, dosage, frequency, startedAt, notes, packQty } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    if (!name || !String(name).trim()) { res.status(400).json({ error: 'Informe o nome do remédio (ex.: varfarina).' }); return; }
    const cleanPack = packQty != null ? (() => { const n = Math.round(Number(packQty) || 0); return n >= 1 && n <= 2000 ? n : null; })() : null;
    const vtexData = (req.body ?? {}) as { vtexPhotoUrl?: string | null; vtexPriceCents?: number | null; vtexProductName?: string | null; vtexPharmacy?: string | null };
    // DEFAULT pack=30 quando não especificado (a apresentação mais comum no Brasil).
    // Sem isto a chave fica BARISTAR|30MG|CAP|? → insufficient_data → card vazio.
    const finalPack = cleanPack ?? 30;
    const m = await prisma.medication.create({
      data: {
        patientId: pid,
        name: String(name).trim(),
        dosage: dosage ? String(dosage).trim() : null,
        frequency: frequency ? String(frequency).trim() : null,
        startedAt: startedAt ? new Date(startedAt) : null,
        notes: notes ? String(notes).trim() : null,
        packQty: finalPack,
        priceStatus: 'queued',
      },
    });

    // PREÇO INSTANTÂNEO — VTEX PRIMEIRO (o usuário VIU o preço no combobox, ele TEM que
    // aparecer). O catálogo é fallback — pode ter meia-resposta (foto sem preço).
    try {
      const { normDrug } = await import('../utils/interactions');
      const { buildNormalizedMedication } = await import('../pricing/normalize');
      const raw = normDrug(String(name).trim());
      const { ALIASES_PUBLIC } = await import('../utils/interactions');
      const ingredient = (ALIASES_PUBLIC as Record<string, string>)[raw] ?? raw;
      let cat = await prisma.medicationCatalogEntry.findUnique({ where: { activeIngredient: ingredient } });
      if (!cat) cat = await prisma.medicationCatalogEntry.findUnique({ where: { activeIngredient: raw } });

      const normalized = buildNormalizedMedication(m);

      // PRIORIDADE 1: VTEX do combobox — SEMPRE wins (tem preço + foto + productName)
      // Baristar bug: cat estava com meia-resposta → if(cat) rodava com key null → só foto
      if (vtexData?.vtexPriceCents && vtexData?.vtexProductName) {
        const key = normalized.medicationKey ?? `VTX|${raw}`;
        const now = new Date();
        // SEMPRE salva a offer do VTEX — key completa ou não (o card precisa acender AGORA)
        await prisma.medicationPriceSnapshot.upsert({
          where: { medicationKey_locationKey: { medicationKey: key, locationKey: 'BR' } },
          create: {
            medicationKey: key, locationKey: 'BR',
            lowestPriceCents: vtexData.vtexPriceCents, averagePriceCents: vtexData.vtexPriceCents,
            offersCount: 1, provider: 'vtex-combobox',
            collectedAt: now, expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
            offers: { create: [{
              pharmacy: vtexData.vtexPharmacy ?? 'Pague Menos',
              productName: vtexData.vtexProductName,
              priceCents: vtexData.vtexPriceCents,
              url: 'https://www.paguemenos.com.br',
              imageUrl: vtexData.vtexPhotoUrl ?? null,
              ean: null, lastCheckedAt: now,
            }] },
          },
          update: {},
        }).catch(() => {});
        await prisma.medication.update({
          where: { id: m.id },
          data: {
            priceStatus: 'available',
            priceCheckedAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7h atrás: 'available' + stale → worker enriquece no próximo tick SEM esconder o preço do usuário
            nameNormalized: key, catalogPhotoUrl: vtexData.vtexPhotoUrl ?? null,
            activeIngredient: normalized.activeIngredient,
            dosageValue: normalized.dosageValue ?? null, dosageUnit: normalized.dosageUnit ?? null,
            form: normalized.form ?? null,
          },
        });
        // NÃO sobrescrever pra 'queued' — isto escondia o preço que acabamos de salvar!
      } else if (cat) {
        const normalized = buildNormalizedMedication(m);
        const key = normalized.medicationKey;
        const now = new Date();
        if (key && !key.endsWith('|?') && cat.priceCents) {
          // Sem URL no catálogo → snapshot SEM offer (o card acende com o preço, mas o
          // worker busca a lista completa com links REAIS em <30s — nunca link genérico)
          const hasRealUrl = !!cat.productUrl;
          const offerCount = hasRealUrl ? 1 : 0; // SEMPRE igual ao nº real de offers criadas
          await prisma.medicationPriceSnapshot.upsert({
            where: { medicationKey_locationKey: { medicationKey: key, locationKey: 'BR' } },
            create: {
              medicationKey: key, locationKey: 'BR',
              lowestPriceCents: cat.priceCents, averagePriceCents: cat.priceCents,
              offersCount: offerCount, // NUNCA copiar cat.offersCount (o card mostraria "4" com só 1 real)
              provider: 'catalogo',
              collectedAt: now,
              expiresAt: new Date(now.getTime() + (hasRealUrl ? 2 * 60 * 60 : 5 * 60) * 1000),
              ...(hasRealUrl ? { offers: { create: [{ pharmacy: cat.pharmacy ?? 'Pague Menos', productName: cat.productName ?? String(name).trim(), priceCents: cat.priceCents, url: cat.productUrl!, imageUrl: cat.photoUrl, ean: cat.ean, lastCheckedAt: now }] } } : {}),
            },
            update: {},
          }).catch(() => {});
          await prisma.medication.update({
            where: { id: m.id },
            data: {
              priceStatus: 'available',
              priceCheckedAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7h atrás: 'available' + stale → worker enriquece SEM esconder o preço
              nameNormalized: key, catalogPhotoUrl: cat.photoUrl, activeIngredient: normalized.activeIngredient, dosageValue: normalized.dosageValue ?? null, dosageUnit: normalized.dosageUnit ?? null, form: normalized.form ?? null,
            },
          });
          // NÃO sobrescrever pra 'queued' — escondia o preço do usuário!
        } else if (cat.photoUrl) {
          await prisma.medication.update({ where: { id: m.id }, data: { catalogPhotoUrl: cat.photoUrl } });
        }
      }
    } catch { /* catálogo falhou → worker cobre */ }

    res.status(201).json(m);
  } catch (e) { next(e); }
});

// UPDATE (toggle ativo, editar dose/frequência)
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const m = await prisma.medication.findUnique({ where: { id: String(req.params.id) } });
    if (!m) { res.status(404).json({ error: 'Remédio não encontrado.' }); return; }
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(m.patientId)) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const { name, dosage, frequency, active, notes, packQty } = req.body ?? {};
    // packQty = pergunta contextual "qual embalagem você compra?" (FASE 2) → re-enfileira preço
    const requeuePrice = packQty != null && Number(packQty) !== m.packQty;
    const updated = await prisma.medication.update({
      where: { id: m.id },
      data: {
        name: name != null ? String(name).trim() : undefined,
        dosage: dosage != null ? String(dosage).trim() : undefined,
        frequency: frequency != null ? String(frequency).trim() : undefined,
        notes: notes != null ? String(notes).trim() : undefined,
        active: typeof active === 'boolean' ? active : undefined,
        packQty: packQty != null ? (() => { const n = Math.round(Number(packQty) || 0); return n >= 1 && n <= 2000 ? n : null; })() : undefined,
        ...(requeuePrice ? { priceStatus: 'queued' as const } : {}),
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const m = await prisma.medication.findUnique({ where: { id: String(req.params.id) } });
    if (!m) { res.status(404).json({ error: 'Remédio não encontrado.' }); return; }
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(m.patientId)) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    await prisma.medication.deleteMany({ where: { id: m.id } }); // idempotente: já sumiu → ok
    res.json({ id: m.id });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// CHECAGEM — determinística contra a base curada (offline, confiável)
// ---------------------------------------------------------------------------

const checkPatient = async (userId: string, patientId?: string) => {
  const pids = await userPatientIds(userId);
  const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
  if (!pid) return null;
  const [patient, meds, rules] = await Promise.all([
    prisma.patient.findUnique({ where: { id: pid }, select: { id: true, fullName: true, dateOfBirth: true, clinicalProfile: true } }),
    prisma.medication.findMany({ where: { patientId: pid, active: true } }),
    prisma.interactionRule.findMany(),
  ]);
  return { patient, meds, rules, hits: matchInteractions(meds, rules), unmatched: findUnmatched(meds, rules) };
};

// CHECK (GRÁTIS): apenas os CRÍTICOS D/X — segurança não se cobra.
// `unmatched` = remédios que a base não conhece → UI avisa (nunca ✅ verde falso).
router.get('/check', async (req: AuthedRequest, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const c = await checkPatient(req.userId!, q.patientId);
    if (!c) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const critical = c.hits.filter((h) => isCritical(h.severity));
    res.json({
      checkedAt: new Date().toISOString(),
      activeMeds: c.meds.length,
      critical,
      unmatched: c.unmatched,
      hasMore: c.hits.length > critical.length,
      hint: c.hits.length > critical.length ? 'Há interações de severidade menor — a análise completa mostra todas.' : undefined,
    });
  } catch (e) { next(e); }
});

// CHECK/FULL (2 créditos): TODAS as severidades + leitura contextual da IA
// (considera os exames alterados do paciente; nunca dosa/prescreve — diagnosticGuard).
router.post('/check/full', async (req: AuthedRequest, res, next) => {
  try {
    const { patientId } = req.body ?? {};
    const c = await checkPatient(req.userId!, patientId);
    if (!c) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    // Débito atômico ANTES (padrão do chat); falha de IA → reembolso.
    const charged = await chargeCredits(req.userId!, CREDIT_COSTS.chat, 'med_interaction', 'Checagem completa de interações');
    if (!charged) { res.status(402).json({ error: 'insufficient_credits', message: 'Sem créditos para a análise completa. Compre um pacote de créditos.' }); return; }

    let contextual: string | null = null;
    try {
      // Contexto RICO: marcadores alterados + perfil clínico + datas dos exames —
      // a IA usa TUDO pra dar conselho personalizado (ex.: "toma levoid, tira a tireoide,
      // TSH último há 3 meses → sugira novo exame p/ ajustar dose").
      const [abn, patient] = await Promise.all([
        prisma.examItem.findMany({
          where: { exam: { patientId: c.patient!.id, status: 'EXTRACTED' }, isAbnormal: true },
          orderBy: { exam: { performedAt: 'desc' } },
          select: { name: true, valueText: true, unit: true, flag: true, exam: { select: { performedAt: true, title: true } } },
          take: 60,
        }),
        prisma.patient.findUnique({ where: { id: c.patient!.id }, select: { dateOfBirth: true, clinicalProfile: true, gender: true } }),
      ]);
      const seen = new Set<string>(); const markers = abn.filter((i) => {
        const k = i.name.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true;
      }).slice(0, 12).map((i) => {
        const dt = i.exam.performedAt ? new Date(i.exam.performedAt).toLocaleDateString('pt-BR') : 's/d';
        return `${i.name}=${i.valueText}${i.unit} (${dt})`;
      });
      const age = patient?.dateOfBirth ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 86400000)) : null;

      const { getLlm, getModel } = await import('../llm');
      const sys = [
        'Você é o Dr. Exame. Seja DIRETO e BREVE — o paciente está no celular.',
        'NUNCA prescreva ou sugira dose.',
        '',
        'FORMATO OBRIGATÓRIO (máximo 6 linhas no total):',
        'Linha 1: ✅ tudo certo / ⚠️ atenção com [remédio]',
        'Linha 2-3: UMA frase cruzando remédio + exame (ex.: "Toma levoid e TSH veio alto em 07/25 — pode precisar de ajuste de dose.")',
        'Linha 4: "Perguntas pro médico:"',
        'Linha 5-6: 2-3 perguntas CURTAS (1 linha cada, sem explicação)',
        '',
        'PROIBIDO: parágrafos longos, explicações de mecanismo, texto introdutório,',
        'conclusão em bloco. Se não tem nada importante, só a linha 1 e as perguntas.',
        'MÁXIMO 80 palavras no total.',
      ].join('\n');
      const user = [
        `PACIENTE: ${age != null ? `${age} anos` : 'idade n/d'}, ${patient?.gender === 'female' ? 'feminino' : patient?.gender === 'male' ? 'masculino' : 'n/d'}.`,
        `PERFIL CLÍNICO (texto do paciente): "${patient?.clinicalProfile || 'não informado'}"`,
        '',
        `REMÉDIOS ATIVOS: ${c.meds.map((m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}`).join('; ') || 'nenhum'}.`,
        `INTERAÇÕES: ${c.hits.map((h) => `${h.drugA}+${h.drugB} (${h.severity})`).join('; ') || 'nenhuma'}.`,
        `EXAMES ALTERADOS (valor + data): ${markers.join('; ') || 'nenhum'}.`,
        '',
        'Escreva a análise personalizada seguindo o FORMATO acima.',
      ].join('\n');
      const r = await getLlm().complete({ model: getModel(), maxTokens: 800, system: sys, messages: [{ role: 'user', content: user }] });
      contextual = r.text;
    } catch (e) {
      await refundCredits(req.userId!, CREDIT_COSTS.chat, 'med_interaction_refund', 'Reembolso: IA indisponível (interações)');
      contextual = null;
    }

    res.json({
      checkedAt: new Date().toISOString(),
      activeMeds: c.meds.length,
      all: c.hits.map((h) => ({ ...h, severityLabel: SEVERITY_LABEL[h.severity] })),
      unmatched: c.unmatched,
      contextual,
      contextualAvailable: contextual != null,
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// SCAN-PHOTO — foto da receita/caixa → OCR (tesseract pt-BR) → IA lista os remédios
// (genérico quando reconhece) → usuário CONFIRMA na tela (nada é salvo sem confirmação).
// Grátis (aquisição); IA limitada pelo aiLimiter no app.ts.
// ---------------------------------------------------------------------------
const scanAt = new Map<string, number>();
router.post('/scan-photo', upload.single('photo'), async (req: AuthedRequest, res, next) => {
  try {
    const uid = req.userId!;
    if (Date.now() - (scanAt.get(uid) ?? 0) < 30_000) { res.status(429).json({ error: 'Aguarde alguns segundos entre fotos.' }); return; }
    scanAt.set(uid, Date.now());
    const file = req.file;
    if (!file || !file.buffer?.length) { res.status(400).json({ error: 'Envie a foto como campo "photo".' }); return; }
    if (file.size > 6 * 1024 * 1024) { res.status(413).json({ error: 'Foto muito grande (máx. 6MB).' }); return; }

    const { imageToText } = await import('../extraction/imageToText');
    const text = await imageToText(file.buffer);
    if (!text || text.trim().length < 15) { res.status(422).json({ error: 'Não conseguimos ler a foto. Tente com mais luz ou digite o nome do remédio.' }); return; }

    const { getLlm, getModel } = await import('../llm');
    const { extractJsonObject } = await import('../utils/json');
    const sys = [
      'Você extrai NOMES DE MEDICAMENTOS de textos de receitas, bulas e caixas (OCR em português).',
      'Regras: (1) devolva SEMPRE JSON no formato {"medications":[{"name":"...","dosage":"..."}]};',
      '(2) "name" = nome GENÉRICO da substância em português quando você reconhecer (Levoid→levotiroxina, Glifage→metformina), senão o texto como está;',
      '(3) "dosage" se vier no texto (ex.: "50 mcg"), senão string vazia;',
      '(4) ignore posologia, médico, CRM, data e qualquer coisa que não seja medicamento;',
      '(5) sem medicamentos? devolva lista vazia.',
    ].join(' ');
    const r = await getLlm().complete({
      model: getModel(), maxTokens: 600, system: sys,
      messages: [{ role: 'user', content: `Texto do OCR:\n${text.slice(0, 4000)}` }],
    });
    const parsed = extractJsonObject(r.text) as { medications?: { name?: string; dosage?: string }[] };
    const suggestions = (Array.isArray(parsed?.medications) ? parsed.medications : [])
      .map((m) => ({ name: String(m?.name ?? '').trim(), dosage: String(m?.dosage ?? '').trim() }))
      .filter((m) => m.name && m.name.length >= 3)
      .slice(0, 12);
    res.json({ suggestions, readChars: text.trim().length });
  } catch (e) { next(e); }
});

// CATÁLOGO: busca PRODUTOS (foto + dose + pack + preço do VTEX) pro combobox.
// Retorna VARIANTES — "Dipirona 500mg 20cp Genérico R$ 3,50" — o usuário escolhe
// o produto completo, não o ingrediente abstrato. 1 toque salva tudo.
router.get('/catalog', async (req: AuthedRequest, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) { res.json([]); return; }
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    // 1. Busca no catálogo local (instantâneo — tem foto+preço já cacheados)
    const entries = await prisma.medicationCatalogEntry.findMany({ take: 100 });
    const localHits = entries
      .filter((e) => {
        const hay = norm(`${e.name} ${(e.brands ?? []).join(' ')} ${e.activeIngredient}`);
        return hay.includes(norm(q));
      })
      .slice(0, 4)
      .map((e) => ({
        name: e.name, productName: e.productName ?? e.name,
        photoUrl: e.photoUrl, priceCents: e.priceCents,
        pharmacy: e.pharmacy, dosage: '', packQty: null as number | null,
      }));

    // 2. Busca LIVE na VTEX — SÓ se local não tem NADA (não gasta API à toa).
    //    Resultados são CACHEADOS no catálogo: próxima busca da mesma coisa é local.
    let vtexHits: typeof localHits = [];
    if (localHits.length === 0) {
      try {
        const { pagueMenosProvider } = await import('../pricing/providers/pagueMenos');
        const offers = await pagueMenosProvider.search({ medicationKey: null, activeIngredient: q, dosageValue: undefined, dosageUnit: undefined, form: 'CP' });
        const { normDrug } = await import('../utils/interactions');
        const cleanName = (pn: string): string => {
          const t = pn.replace(/\d+[.,]?\d*\s*(mg|mcg|ml|g|ui)\b.*$/i, '').replace(/\d+\s*(comprimido|cp|capsula|cap|cx|caixa|un)\b.*$/i, '').trim();
          return t || pn.split(' ')[0];
        };
        vtexHits = offers.slice(0, 6).map((o) => ({
          name: cleanName(o.productName),
          productName: o.productName,
          photoUrl: o.imageUrl ?? null, priceCents: o.priceCents,
          pharmacy: o.pharmacy, dosage: '', packQty: null as number | null,
        }));

        // CACHEIA: salva no catálogo pra a próxima busca ser local (0ms, 0 API externa)
        const best = offers[0];
        if (best) {
          const ingredient = normDrug(cleanName(best.productName));
          // resolve alias (LEVOID → LEVOTIROXINA) pra bater com o catálogo existente
          const { ALIASES_PUBLIC } = await import('../utils/interactions');
          const resolved = (ALIASES_PUBLIC as Record<string, string>)[ingredient] ?? ingredient;
          await prisma.medicationCatalogEntry.upsert({
            where: { activeIngredient: resolved },
            create: {
              name: cleanName(best.productName), activeIngredient: resolved,
              brands: [], doses: [],
              photoUrl: best.imageUrl ?? null, priceCents: best.priceCents ?? null,
              productName: best.productName, productUrl: best.url ?? null,
              pharmacy: best.pharmacy ?? null, ean: best.ean ?? null,
              offersCount: offers.length, vtexQuery: q, lastRefreshedAt: new Date(),
            },
            update: {
              photoUrl: best.imageUrl ?? undefined, priceCents: best.priceCents ?? undefined,
              productName: best.productName, productUrl: best.url ?? undefined,
              offersCount: offers.length, lastRefreshedAt: new Date(),
            },
          }).catch(() => {}); // upsert falhou → não trava a busca
        }
      } catch { /* VTEX fora → só local */ }
    }

    // merge sem duplicar (por productName)
    const seen = new Set<string>();
    const all = [...localHits, ...vtexHits].filter((h) => {
      const k = norm(h.productName); if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 8);

    // extrai dose e pack do productName ("Dipirona 500mg 20 Comprimidos" → dose=500mg, pack=20)
    const doseRe = /(\d+[.,]?\d*)\s*(mg|mcg|ml|g|ui)\b/i;
    const packRe = /(\d+)\s*(comprimido|cp|capsula|cap|cx|caixa|dragea|un)/i;
    const enriched = all.map((h) => {
      const dose = h.productName.match(doseRe);
      const pack = h.productName.match(packRe);
      return {
        ...h,
        dosage: dose ? `${dose[1]} ${dose[2]}`.replace(',', '.') : '',
        packQty: pack ? parseInt(pack[1], 10) : null,
      };
    });

    res.json(enriched);
  } catch (e) { next(e); }
});

// PREVIEW: busca rápida na fonte (VTEX) ANTES de salvar — mostra foto + preço no
// dialog de adicionar. O usuário vê o que vai custar antes de confirmar (UX inteligente).
router.get('/preview', async (req: AuthedRequest, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const name = String(q.name ?? '').trim();
    const dosage = String(q.dosage ?? '').trim();
    if (!name || name.length < 3) { res.status(400).json({ error: 'Informe o nome do remédio.' }); return; }
    const { pagueMenosProvider } = await import('../pricing/providers/pagueMenos');
    const { buildNormalizedMedication } = await import('../pricing/normalize');
    const normalized = buildNormalizedMedication({ name, dosage });
    try {
      const offers = await pagueMenosProvider.search(normalized);
      const best = offers[0] ?? null;
      res.json({
        found: !!best,
        photo: best?.imageUrl ?? null,
        priceCents: best?.priceCents ?? null,
        productName: best?.productName ?? null,
        pharmacy: best?.pharmacy ?? 'Pague Menos',
        offersCount: offers.length,
      });
    } catch {
      res.json({ found: false, photo: null, priceCents: null, offersCount: 0 }); // fonte fora → sem preview, não trava
    }
  } catch (e) { next(e); }
});

// PREÇOS de um remédio: snapshot + ofertas (dialog "Ver preços"). Sem preço → status.
router.get('/:id/prices', async (req: AuthedRequest, res, next) => {
  try {
    const m = await prisma.medication.findUnique({ where: { id: String(req.params.id) } });
    if (!m) { res.status(404).json({ error: 'Remédio não encontrado.' }); return; }
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(m.patientId)) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    const snapshot = m.nameNormalized && !m.nameNormalized.endsWith('|?')
      ? await prisma.medicationPriceSnapshot.findFirst({
          where: { medicationKey: m.nameNormalized, locationKey: 'BR' },
          include: { offers: { orderBy: { priceCents: 'asc' }, take: 12 } },
        })
      : null;
    res.json({ status: m.priceStatus, snapshot });
  } catch (e) { next(e); }
});

// FORCE REFRESH: apaga TODOS os snapshots → worker recria com lista completa da VTEX.
// Uso único: depois de deploy do fix do ensureSnapshot (snapshots antigos tinham offers erradas).
router.post('/refresh-all', async (req: AuthedRequest, res, next) => {
  try {
    const count = await prisma.medicationPriceSnapshot.deleteMany({});
    await prisma.medication.updateMany({ data: { priceStatus: 'queued', priceCheckedAt: new Date(Date.now() - 8 * 60 * 60 * 1000) } });
    res.json({ deleted: count.count, message: 'Snapshots resetados — worker recria em 30s' });
  } catch (e) { next(e); }
});

// WORKER TICK — só em dev/teste (QA e testes E2E disparam sem esperar o cron de 5min).
router.post('/worker-tick', async (req: AuthedRequest, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') { res.status(404).json({ error: 'Não encontrado.' }); return; }
    res.json(await runPriceWorkerTick());
  } catch (e) { next(e); }
});

// PROCESS ONE — dev/teste: processa um medicamento específico (provider do registry).
router.post('/:id/process-price', async (req: AuthedRequest, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') { res.status(404).json({ error: 'Não encontrado.' }); return; }
    const m = await prisma.medication.findUnique({ where: { id: String(req.params.id) } });
    if (!m) { res.status(404).json({ error: 'Remédio não encontrado.' }); return; }
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(m.patientId)) { res.status(403).json({ error: 'Sem permissão.' }); return; }
    res.json({ outcome: await processMedicationPrice(m.id, ProviderRegistry.default) });
  } catch (e) { next(e); }
});

// BULK — salva os remédios CONFIRMADOS pelo usuário (vindos do scan), sem repetir os já ativos.
router.post('/bulk', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, items } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    if (!Array.isArray(items) || items.length === 0 || items.length > 20) { res.status(400).json({ error: 'Lista de remédios inválida.' }); return; }
    const existing = new Set((await prisma.medication.findMany({ where: { patientId: pid, active: true } })).map((m) => m.name.trim().toLowerCase()));
    const toCreate = items
      .filter((it: any) => it?.name && String(it.name).trim())
      .filter((it: any) => !existing.has(String(it.name).trim().toLowerCase()))
      .map((it: any) => ({
        patientId: pid,
        name: String(it.name).trim(),
        dosage: it.dosage ? String(it.dosage).trim() : null,
        frequency: it.frequency ? String(it.frequency).trim() : null,
        priceStatus: 'queued', // worker busca preço em background
      }));
    if (toCreate.length) await prisma.medication.createMany({ data: toCreate });
    res.status(201).json({ created: toCreate.length, skipped: items.length - toCreate.length });
  } catch (e) { next(e); }
});

export default router;
