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
