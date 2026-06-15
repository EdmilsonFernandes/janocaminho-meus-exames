import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';

const router = Router();
router.use(requireAuth);

// LIST
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { start, take } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const where: any = { patientId: { in: pids } };
    if (q.patientId && pids.includes(q.patientId)) where.patientId = q.patientId;
    if (q.type) where.type = q.type;
    const [total, rows] = await prisma.$transaction([
      prisma.measurement.count({ where }),
      prisma.measurement.findMany({ where, skip: start, take, orderBy: { measuredAt: 'desc' } }),
    ]);
    setListHeaders(res, start, start + take, total);
    res.json(rows);
  } catch (e) { next(e); }
});

// CREATE
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, type, value, valueSecondary, unit, measuredAt, note } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid || !type || value == null || !measuredAt) {
      res.status(400).json({ error: 'Tipo, valor e data são obrigatórios.' });
      return;
    }
    const m = await prisma.measurement.create({
      data: {
        patientId: pid,
        type: String(type),
        value: Number(value),
        valueSecondary: valueSecondary != null ? Number(valueSecondary) : null,
        unit: unit ? String(unit) : '',
        measuredAt: new Date(measuredAt),
        note: note ? String(note) : null,
      },
    });
    res.status(201).json(m);
  } catch (e) { next(e); }
});

// DELETE
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const m = await prisma.measurement.findUnique({ where: { id: String(req.params.id) } });
    if (!m) { res.status(404).json({ error: 'Medição não encontrada' }); return; }
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(m.patientId)) { res.status(403).json({ error: 'Sem permissão' }); return; }
    await prisma.measurement.delete({ where: { id: m.id } });
    res.json({ id: m.id });
  } catch (e) { next(e); }
});

export default router;
