import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';
import { getAnthropic, MODEL } from '../claude/client';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';
import { getCachedExplanation, setCachedExplanation } from '../utils/explanationsCache';

const router = Router();
router.use(requireAuth);

// ATUALIZAR item (corrigir valor extraído — usuário corrige erro de OCR; recalc flag)
router.patch('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.examItem.findUnique({ where: { id: String(req.params.id) }, include: { exam: { select: { patientId: true } } } });
    if (!existing) { res.status(404).json({ error: 'Item não encontrado' }); return; }
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(existing.exam.patientId)) { res.status(403).json({ error: 'Sem permissão' }); return; }
    const b = req.body ?? {};
    const valueText = b.valueText != null ? String(b.valueText) : existing.valueText;
    const valueNumeric = b.valueNumeric != null ? (b.valueNumeric === '' || b.valueNumeric == null ? null : Number(b.valueNumeric)) : existing.valueNumeric;
    const unit = b.unit != null ? (b.unit || null) : existing.unit;
    const refLow = b.refLow != null ? (b.refLow === '' || b.refLow == null ? null : Number(b.refLow)) : existing.refLow;
    const refHigh = b.refHigh != null ? (b.refHigh === '' || b.refHigh == null ? null : Number(b.refHigh)) : existing.refHigh;
    let flag = existing.flag; let isAbnormal = existing.isAbnormal;
    if (valueNumeric != null && refLow != null && refHigh != null) {
      isAbnormal = valueNumeric < refLow || valueNumeric > refHigh;
      flag = isAbnormal ? (valueNumeric > refHigh ? 'HIGH' : 'LOW') : 'NORMAL';
    }
    const updated = await prisma.examItem.update({ where: { id: String(req.params.id) }, data: { valueText, valueNumeric, unit, refLow, refHigh, flag, isAbnormal } });
    res.json(updated);
  } catch (e) { next(e); }
});

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
      include: { exam: { select: { id: true, performedAt: true, title: true } } },
      orderBy: { exam: { performedAt: 'asc' } },
    });
    const byName = new Map<string, any[]>();
    const seen = new Set<string>(); // dedup por (analito + data + valor) — exames duplicados viram 1 ponto só
    for (const r of rows) {
      const day = r.exam.performedAt ? new Date(r.exam.performedAt).toDateString() : 's/d';
      const dedupKey = `${r.nameCanonical}|${day}|${r.valueNumeric}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const arr = byName.get(r.nameCanonical) ?? [];
      arr.push(r);
      byName.set(r.nameCanonical, arr);
    }
    const out: any[] = [];
    for (const [name, items] of byName) {
      // Mostra TODOS os analitos medidos (mesmo com 1 exame só = "primeiro exame"); antes exigia >=2.
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
        points: items.map((i) => ({ value: i.valueNumeric, date: i.exam.performedAt, flag: i.flag, examId: i.exam.id, examTitle: i.exam.title })),
      });
    }
    // ordem: do exame mais recente pro mais antigo
    out.sort((a, b) => new Date(b.lastDate ?? 0).getTime() - new Date(a.lastDate ?? 0).getTime());
    res.json({ patientId: patientId ?? null, items: out });
  } catch (e) { next(e); }
});

// RESUMO POR FLAG — alimenta o donut do dashboard (bons / alerta / alterados)
router.get('/flag-summary', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
    const scope = patientId && pids.includes(patientId) ? patientId : { in: pids };
    const grouped = await prisma.examItem.groupBy({
      by: ['flag'],
      where: { exam: { patientId: scope, status: 'EXTRACTED' } },
      _count: { _all: true },
    });
    const c: Record<string, number> = {};
    for (const g of grouped) c[g.flag] = g._count._all;
    res.json({
      buckets: {
        bons: (c.NORMAL ?? 0) + (c.UNKNOWN ?? 0),
        alerta: c.LOW ?? 0,
        alterados: (c.HIGH ?? 0) + (c.ABNORMAL ?? 0) + (c.CRITICAL ?? 0),
      },
      raw: c,
    });
  } catch (e) {
    next(e);
  }
});

// EXPLICA um exame/analito em linguagem simples. RAG: cache em arquivo primeiro (sem IA);
// só chama a IA se ainda não tiver a explicação — e então grava pra reaproveitar.
router.post('/explain', async (req: AuthedRequest, res) => {
  try {
    const name = String((req.body as any)?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: 'name obrigatório' }); return; }
    const cached = getCachedExplanation(name);
    if (cached) { res.json(cached); return; }
    const client = getAnthropic();
    const stream = client.messages.stream({
      model: MODEL, max_tokens: 700,
      messages: [{ role: 'user', content: `Explique de forma SIMPLES e CURTA (português, leigo) o exame/analito "${name}". Devolva APENAS JSON: {"titulo":"nome amigável","resumo":"1 frase: o que mede","analogia":"analogia do dia a dia","alterado":"o que pode significar se alto/baixo (sem diagnosticar)"}${JSON_SUFFIX}` }],
    } as any);
    const resp = await stream.finalMessage();
    const text = (resp.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = extractJsonObject(text);
    if (parsed?.resumo) setCachedExplanation(name, parsed);
    res.json(parsed);
  } catch (e: any) {
    console.error('[explain] erro:', e?.message);
    res.status(502).json({ error: 'Não consegui explicar agora. Tente novamente.' });
  }
});

// VALORES ALTERADOS (todos os fora-da-faixa do paciente, do mais recente) — alimenta a página "Valores alterados"
router.get('/abnormal', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
    const scope = patientId && pids.includes(patientId) ? patientId : { in: pids };
    const rows = await prisma.examItem.findMany({
      where: { isAbnormal: true, exam: { patientId: scope, status: 'EXTRACTED' } },
      orderBy: { exam: { performedAt: 'desc' } },
      include: { exam: { select: { id: true, title: true, performedAt: true, sourceLab: true, requestingDoctor: true } } },
      take: 300,
    });
    res.json({ items: rows.map((i) => ({ id: i.id, examId: i.exam.id, name: i.name, nameCanonical: i.nameCanonical, valueText: i.valueText, unit: i.unit, flag: i.flag, refText: i.refText, refLow: i.refLow, refHigh: i.refHigh, examTitle: i.exam.title, performedAt: i.exam.performedAt, sourceLab: i.exam.sourceLab, requestingDoctor: i.exam.requestingDoctor })) });
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
