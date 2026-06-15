import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { start, take } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const where: any = { patientId: { in: pids } };
    if (q.patientId && pids.includes(q.patientId)) where.patientId = q.patientId;
    const [total, rows] = await prisma.$transaction([
      prisma.vaccine.count({ where }),
      prisma.vaccine.findMany({ where, skip: start, take, orderBy: { dateApplied: 'desc' } }),
    ]);
    setListHeaders(res, start, start + take, total);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, name, dateApplied, nextDoseDate, lot, note } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid || !name || !dateApplied) { res.status(400).json({ error: 'Nome e data são obrigatórios.' }); return; }
    const v = await prisma.vaccine.create({ data: { patientId: pid, name: String(name), dateApplied: new Date(dateApplied), nextDoseDate: nextDoseDate ? new Date(nextDoseDate) : null, lot: lot ? String(lot) : null, note: note ? String(note) : null } });
    res.status(201).json(v);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const v = await prisma.vaccine.findUnique({ where: { id: String(req.params.id) } });
    if (!v) { res.status(404).json({ error: 'Vacina não encontrada' }); return; }
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(v.patientId)) { res.status(403).json({ error: 'Sem permissão' }); return; }
    await prisma.vaccine.delete({ where: { id: v.id } });
    res.json({ id: v.id });
  } catch (e) { next(e); }
});

export default router;
