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
import { buildRiskAssessment, latestRiskAssessment } from '../analysis/risk-service';

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
    const { result, saved, fromCache } = await buildRiskAssessment(patientId, { force, examId });
    res.status(fromCache ? 200 : 201).json({ id: saved.id, createdAt: saved.createdAt, fromCache, ...result });
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

export default router;
