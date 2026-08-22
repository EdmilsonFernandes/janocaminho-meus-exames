import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';
import { chargeCredits, refundCredits, CREDIT_COSTS } from '../utils/credits';
import { matchInteractions, isCritical, SEVERITY_LABEL, type InteractionHit } from '../utils/interactions';

/**
 * Remédios do paciente + checagem de interações A–X.
 *
 * Monetização (decisão do dono 2026-08-22): cadastro e alertas CRÍTICOS (D/X) são grátis
 * — segurança não se cobra. A checagem COMPLETA (todas as severidades + leitura
 * contextual da IA considerando os exames do paciente) consome créditos, como o chat.
 */

const router = Router();
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
    setListHeaders(res, start, start + take, total);
    res.json(rows);
  } catch (e) { next(e); }
});

// CREATE
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, name, dosage, frequency, startedAt, notes } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    if (!name || !String(name).trim()) { res.status(400).json({ error: 'Informe o nome do remédio (ex.: varfarina).' }); return; }
    const m = await prisma.medication.create({
      data: {
        patientId: pid,
        name: String(name).trim(),
        dosage: dosage ? String(dosage).trim() : null,
        frequency: frequency ? String(frequency).trim() : null,
        startedAt: startedAt ? new Date(startedAt) : null,
        notes: notes ? String(notes).trim() : null,
      },
    });
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
    const { name, dosage, frequency, active, notes } = req.body ?? {};
    const updated = await prisma.medication.update({
      where: { id: m.id },
      data: {
        name: name != null ? String(name).trim() : undefined,
        dosage: dosage != null ? String(dosage).trim() : undefined,
        frequency: frequency != null ? String(frequency).trim() : undefined,
        notes: notes != null ? String(notes).trim() : undefined,
        active: typeof active === 'boolean' ? active : undefined,
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
    await prisma.medication.delete({ where: { id: m.id } });
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
  return { patient, meds, rules, hits: matchInteractions(meds, rules) };
};

// CHECK (GRÁTIS): apenas os CRÍTICOS D/X — segurança não se cobra.
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
      // Contexto: marcadores alterados recentes (nomes+valores) — a IA personaliza as perguntas.
      const abn = await prisma.examItem.findMany({
        where: { exam: { patientId: c.patient!.id, status: 'EXTRACTED' }, isAbnormal: true },
        orderBy: { exam: { performedAt: 'desc' } },
        select: { name: true, valueText: true, unit: true, exam: { select: { performedAt: true } } },
        take: 40,
      });
      const seen = new Set<string>(); const markers = abn.filter((i) => {
        const k = i.name.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true;
      }).slice(0, 10).map((i) => `${i.name} ${i.valueText ?? ''}${i.unit ?? ''}`.trim());
      const age = c.patient?.dateOfBirth ? Math.floor((Date.now() - new Date(c.patient.dateOfBirth).getTime()) / (365.25 * 86400000)) : null;

      const { getLlm, getModel } = await import('../llm');
      const sys = [
        'Você é o Dr. Exame, assistente de saúde EDUCATIVO do app Meus Exames.',
        'NUNCA prescreva, NUNCA sugira dose, NUNCA diga "pare de tomar" ou "troque por X".',
        'Sua função: explicar em português simples o que as interações conhecidas significam PARA ESTE paciente',
        'e listar de 3 a 5 PERGUNTAS CONCRETAS para levar ao médico/farmacêutico.',
        'Termine sempre com: "As decisões sobre seus remédios são do seu médico."',
      ].join(' ');
      const user = [
        `Paciente${age != null ? ` (${age} anos)` : ''}. Remédios ativos: ${c.meds.map((m) => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}`).join('; ') || 'nenhum'}.`,
        `Interações encontradas na base: ${c.hits.map((h) => `${h.drugA}+${h.drugB} (${h.severity})`).join('; ') || 'nenhuma'}.`,
        `Marcadores alterados recentes nos exames: ${markers.join('; ') || 'nenhum'}.`,
        'Escreva: 1 parágrafo curto de leitura geral + 3 a 5 perguntas para o médico em lista.',
      ].join('\n');
      const r = await getLlm().complete({ model: getModel(), maxTokens: 700, system: sys, messages: [{ role: 'user', content: user }] });
      contextual = r.text;
    } catch (e) {
      await refundCredits(req.userId!, CREDIT_COSTS.chat, 'med_interaction_refund', 'Reembolso: IA indisponível (interações)');
      contextual = null;
    }

    res.json({
      checkedAt: new Date().toISOString(),
      activeMeds: c.meds.length,
      all: c.hits.map((h) => ({ ...h, severityLabel: SEVERITY_LABEL[h.severity] })),
      contextual,
      contextualAvailable: contextual != null,
    });
  } catch (e) { next(e); }
});

export default router;
