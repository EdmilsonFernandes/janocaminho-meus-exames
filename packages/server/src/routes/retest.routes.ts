// GET /api/retest?patientId= — o "próximo exame" do paciente (cartão da Home). Ver analysis/retest.ts.
import { Router } from 'express';
import { requireAuth, AuthedRequest, userPatientIds, firstPatientId } from '../middleware/auth';
import { getRetestPlan } from '../analysis/retest';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const asked = typeof req.query.patientId === 'string' ? req.query.patientId : '';
    // paciente de outra conta → trata como "não informado" (nunca revela que existe)
    const pid = asked && pids.includes(asked) ? asked : await firstPatientId(req.userId!);
    if (!pid) { res.json({ plan: null }); return; }
    res.json({ plan: await getRetestPlan(pid) });
  } catch (e) { next(e); }
});

export default router;
