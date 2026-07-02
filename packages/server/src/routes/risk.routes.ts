/**
 * risk.routes.ts — Endpoints de avaliação de risco (educativa, NÃO diagnóstica).
 *
 *   POST /api/risk/assess   { patientId, force?, examId? }
 *     -> computa a leitura de risco (regras sobre MarkerState + última PA),
 *        persiste RiskAssessment (cache 24h) e devolve o resultado estruturado.
 *        Sem IA/créditos (camada de regras é determinística e grátis).
 *   GET  /api/risk/latest?patientId=...
 *     -> último RiskAssessment persistido (não recomputa).
 *
 * Acesso: dono do paciente (requireAuth + userPatientIds).
 */
import { Router } from 'express';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { prisma } from '../prisma';
import { chargeCredits, CREDIT_COSTS } from '../utils/credits';
import { buildRiskAssessment, latestRiskAssessment } from '../analysis/risk-service';
import { generateActionPlan } from '../analysis/risk-action-plan';
import { computeAdherenceScore, computePredictions } from '../analysis/insights';

const router = Router();
router.use(requireAuth);

// AVALIAR (computa + persiste, com cache)
router.post('/assess', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = String((req.body as any)?.patientId ?? '');
    if (!patientId || !pids.includes(patientId)) {
      res.status(403).json({ error: 'Paciente inválido' });
      return;
    }
    const force = !!(req.body as any)?.force;
    const examId = (req.body as any)?.examId ? String((req.body as any).examId) : null;
    const { result, saved, fromCache, trend, prior } = await buildRiskAssessment(patientId, { force, examId });
    res.status(fromCache ? 200 : 201).json({ id: saved.id, createdAt: saved.createdAt, fromCache, trend, prior, ...result });
  } catch (e) { next(e); }
});

// ÚLTIMO (somente leitura — não recomputa)
router.get('/latest', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = String(req.query.patientId ?? '');
    if (!patientId || !pids.includes(patientId)) {
      res.json({ assessment: null });
      return;
    }
    const assessment = await latestRiskAssessment(patientId);
    res.json({ assessment });
  } catch (e) { next(e); }
});

// SCORE DE ADESÃO (gamificação) — determinístico, grátis
router.get('/adherence', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = String(req.query.patientId ?? '');
    if (!patientId || !pids.includes(patientId)) { res.status(403).json({ error: 'Paciente inválido' }); return; }
    res.json(await computeAdherenceScore(patientId));
  } catch (e) { next(e); }
});

// ALERTA PREDITIVO (projeção de tendência) — determinístico, grátis
router.get('/predictions', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = String(req.query.patientId ?? '');
    if (!patientId || !pids.includes(patientId)) { res.status(403).json({ error: 'Paciente inválido' }); return; }
    res.json({ predictions: await computePredictions(patientId) });
  } catch (e) { next(e); }
});

// FEEDBACK do paciente sobre o plano de ação (loop de melhoria da IA) — grátis
router.post('/feedback', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { riskAssessmentId, rating, comment } = req.body ?? {};
    if (!riskAssessmentId || (rating !== 0 && rating !== 1)) {
      res.status(400).json({ error: 'riskAssessmentId e rating (0 ou 1) obrigatórios' });
      return;
    }
    // valida posse: assessment precisa ser de um paciente do usuário
    const ass = await prisma.riskAssessment.findUnique({ where: { id: String(riskAssessmentId) }, select: { patientId: true } });
    if (!ass || !pids.includes(ass.patientId)) { res.status(403).json({ error: 'Sem permissão' }); return; }
    const fb = await prisma.riskFeedback.create({ data: { riskAssessmentId: String(riskAssessmentId), rating: Number(rating), comment: comment ? String(comment) : null } });
    res.status(201).json({ id: fb.id, rating: fb.rating });
  } catch (e) { next(e); }
});

// CONSENTIMENTO do flywheel (opt-in LGPD: doar dados ANONIMIZADOS pra treinar a IA)
router.get('/consent', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = String(req.query.patientId ?? '');
    if (!patientId || !pids.includes(patientId)) { res.json({ consent: false }); return; }
    const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { dataContributionConsent: true } });
    res.json({ consent: !!p?.dataContributionConsent });
  } catch (e) { next(e); }
});
router.post('/consent', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, consent } = req.body ?? {};
    if (!patientId || !pids.includes(patientId) || typeof consent !== 'boolean') {
      res.status(400).json({ error: 'patientId e consent (boolean) obrigatórios' });
      return;
    }
    await prisma.patient.update({ where: { id: patientId }, data: { dataContributionConsent: consent, consentedAt: consent ? new Date() : null } });
    res.json({ ok: true, consent });
  } catch (e) { next(e); }
});

// PLANO DE AÇÃO (IA — cobra créditos; o RiskCard/leitura de risco seguem grátis)
router.post('/action-plan', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = String((req.body as any)?.patientId ?? '');
    if (!patientId || !pids.includes(patientId)) {
      res.status(403).json({ error: 'Paciente inválido' });
      return;
    }
    // gate de créditos (igual /analyses) — 402 antes de gastar IA
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { credits: true } });
    if ((me?.credits ?? 0) < CREDIT_COSTS.actionPlan) {
      res.status(402).json({ error: 'insufficient_credits', message: 'Sem créditos suficientes. Compre um pacote para gerar o plano de ação.' });
      return;
    }
    const { contentMd, modelUsed, basedOn } = await generateActionPlan(patientId);
    const ok = await chargeCredits(req.userId!, CREDIT_COSTS.actionPlan, 'risk_action_plan', 'Plano de ação (Dr. Exame)');
    if (!ok) {
      // race: saldo mudou entre a checagem e o débito — não cobra, mas já gastamos IA.
      // Best-effort: devolve o conteúdo (caso raro).
      console.warn('[risk/action-plan] débito falhou pós-geração (saldo mudou) — conteúdo devolvido sem cobrança.');
    }
    res.status(201).json({ contentMd, modelUsed, basedOn });
  } catch (e: any) {
    if (e?.status === 409) { res.status(409).json({ error: 'no_risk_assessment', message: e.message }); return; }
    if (!res.headersSent) res.status(500).json({ error: 'Não foi possível gerar o plano agora (serviço de IA). Tente novamente.' });
  }
});

export default router;
