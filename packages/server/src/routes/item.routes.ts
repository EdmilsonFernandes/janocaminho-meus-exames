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

// EVOLUÇÃO por analito (timeline narrativa): analitos com >=2 pontos numéricos,
// com variação %, direção e previsão de sair da faixa — alimenta a página "Evolução".
router.get('/evolution', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
    const scope = patientId && pids.includes(patientId) ? patientId : { in: pids };
    const rows = await prisma.examItem.findMany({
      where: { valueNumeric: { not: null }, exam: { patientId: scope, status: 'EXTRACTED' } },
      include: { exam: { select: { performedAt: true, title: true } } },
      orderBy: { exam: { performedAt: 'asc' } },
    });
    const byName = new Map<string, any[]>();
    for (const r of rows) {
      const arr = byName.get(r.nameCanonical) ?? [];
      arr.push(r);
      byName.set(r.nameCanonical, arr);
    }
    const out: any[] = [];
    for (const [name, items] of byName) {
      if (items.length < 2) continue; // precisa de >=2 pontos p/ evolução
      const first = items[0];
      const last = items[items.length - 1];
      const v0 = first.valueNumeric!, v1 = last.valueNumeric!;
      const pct = v0 !== 0 ? Math.round(((v1 - v0) / Math.abs(v0)) * 100) : 0;
      const t0 = new Date(first.exam.performedAt ?? Date.now()).getTime();
      const xs = items.map((i) => (new Date(i.exam.performedAt ?? Date.now()).getTime() - t0) / 86400000);
      const ys = items.map((i) => i.valueNumeric!);
      const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
      const sxy = xs.reduce((a, _, i) => a + xs[i] * ys[i], 0), sxx = xs.reduce((a, x) => a + x * x, 0);
      const slope = n * sxx - sx * sx !== 0 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0;
      const span = Math.max(...ys) - Math.min(...ys) || 1;
      let dir: 'up' | 'down' | 'stable' = 'stable';
      if (Math.abs(slope) > 0.0001 && (Math.abs(slope) * 365) / span > 0.02) dir = slope > 0 ? 'up' : 'down';
      let predictMonths: number | null = null;
      const refLow = items[0].refLow, refHigh = items[0].refHigh;
      if (dir !== 'stable' && (refLow != null || refHigh != null)) {
        const intercept = (sy - slope * sx) / n;
        const ref = dir === 'up' ? refHigh : refLow;
        if (ref != null && slope !== 0) {
          const daysExit = (ref - intercept) / slope;
          const daysFromNow = daysExit - xs[xs.length - 1];
          if (daysFromNow > 0 && daysFromNow <= 1825) predictMonths = Math.round(daysFromNow / 30);
        }
      }
      out.push({
        nameCanonical: name,
        unit: items[0].unit ?? null,
        refLow, refHigh,
        firstValue: v0, lastValue: v1,
        firstDate: first.exam.performedAt, lastDate: last.exam.performedAt,
        pctChange: pct, direction: dir, predictMonths,
        inRange: (refLow == null || v1 >= refLow) && (refHigh == null || v1 <= refHigh),
        count: items.length,
        points: items.map((i) => ({ value: i.valueNumeric, date: i.exam.performedAt, flag: i.flag })),
      });
    }
    out.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
    res.json({ patientId: patientId ?? null, items: out });
  } catch (e) { next(e); }
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
