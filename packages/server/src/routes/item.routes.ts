import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';

const router = Router();
router.use(requireAuth);

// SÉRIE TEMPORAL de um analito (para o gráfico de evolução)
router.get('/timeseries', async (req: AuthedRequest, res, next) => {
  try {
    const nameCanonical = String(req.query.nameCanonical ?? '');
    if (!nameCanonical) {
      res.status(400).json({ error: 'nameCanonical obrigatório' });
      return;
    }
    const pids = await userPatientIds(req.userId!);
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
    const where: any = {
      nameCanonical,
      exam: { patientId: patientId && pids.includes(patientId) ? patientId : { in: pids } },
    };
    const rows = await prisma.examItem.findMany({
      where,
      include: { exam: { select: { id: true, performedAt: true, title: true } } },
      orderBy: { exam: { performedAt: 'asc' } },
    });
    const points = rows
      .filter((r) => r.valueNumeric != null)
      .map((r) => ({
        examId: r.exam.id,
        performedAt: r.exam.performedAt,
        title: r.exam.title,
        valueNumeric: r.valueNumeric,
        unit: r.unit,
        flag: r.flag,
      }));
    res.json({
      nameCanonical,
      unit: rows[0]?.unit ?? null,
      refLow: rows[0]?.refLow ?? null,
      refHigh: rows[0]?.refHigh ?? null,
      points,
    });
  } catch (e) {
    next(e);
  }
});

// NOMES DISTINTOS de analitos com valor numérico (alimenta o seletor de tendência)
router.get('/distinct-names', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
    const rows = await prisma.examItem.groupBy({
      by: ['nameCanonical'],
      where: {
        valueNumeric: { not: null },
        exam: { patientId: patientId && pids.includes(patientId) ? patientId : { in: pids } },
      },
      _count: { _all: true },
      orderBy: { nameCanonical: 'asc' },
    });
    res.json(rows.map((r) => ({ nameCanonical: r.nameCanonical, count: r._count._all })));
  } catch (e) {
    next(e);
  }
});

// LIST (react-admin)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { start, take } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const where: any = { exam: { patientId: { in: pids } } };
    if (q.patientId) where.exam = { patientId: q.patientId }; // escopo por paciente específico
    if (q.examId) where.examId = q.examId;
    if (q.abnormal === 'true') where.isAbnormal = true;
    const [total, rows] = await prisma.$transaction([
      prisma.examItem.count({ where }),
      prisma.examItem.findMany({ where, skip: start, take, orderBy: { name: 'asc' } }),
    ]);
    setListHeaders(res, start, start + take, total);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
