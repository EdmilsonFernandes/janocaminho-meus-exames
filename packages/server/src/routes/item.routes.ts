import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';
import { getOrCreateExplanation } from '../analysis/explain';
import { collapseAdjacentNearDupes } from '../analysis/dedup';

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
      include: { exam: { select: { id: true, performedAt: true, title: true, createdAt: true } } },
      orderBy: { exam: { performedAt: 'asc' } },
    });
    // DEDUP por dia: 2 exames no mesmo dia com o mesmo analito (reenvio de arquivo, ou
    // hemograma + painel amplo sobreposto) viram 1 ponto só — keep o do exame cujo
    // upload/extração é mais recente (createdAt maior). Sem isto a curva mostra duplicados.
    const byDay = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (r.valueNumeric == null) continue;
      const day = r.exam.performedAt ? new Date(r.exam.performedAt).toDateString() : 's/d';
      const prev = byDay.get(day);
      if (!prev || new Date(r.exam.createdAt).getTime() > new Date(prev.exam.createdAt).getTime()) {
        byDay.set(day, r);
      }
    }
    const rawPoints = [...byDay.values()]
      .sort((a, b) => new Date(a.exam.performedAt ?? 0).getTime() - new Date(b.exam.performedAt ?? 0).getTime())
      .map((r) => ({
        examId: r.exam.id,
        performedAt: r.exam.performedAt,
        title: r.exam.title,
        valueNumeric: r.valueNumeric,
        unit: r.unit,
        flag: r.flag,
      }));
    // DEDUP cross-day: mesma medição em 2 PDFs/datas adjacentes (ex.: TSH 05/03 + 06/03, ambos 25.7)
    // vira 1 ponto — mantém a data de coleta (mais antiga). Centralizado em analysis/dedup.
    const points = collapseAdjacentNearDupes(
      rawPoints,
      (p) => new Date(p.performedAt ?? 0).getTime(),
      (p) => p.valueNumeric ?? 0,
    );
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

// NOMES DISTINTOS de analitos com valor numérico (alimenta o seletor de tendência).
// Conta pontos PÓS-DEDUP — mesmo pipeline do /timeseries (dedup por dia [maior createdAt]
// + collapseAdjacentNearDupes cross-day). Antes usávamos groupBy _count _all, que inflava
// o count com duplicatas (mesmo PDF re-enviado, cross-day, intra-doc) e ficava divergente
// do gráfico (ex.: "TSH (9)" mas só 7 pontos plotados).
router.get('/distinct-names', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
    const pidFilter = patientId && pids.includes(patientId) ? patientId : { in: pids };
    const rows = await prisma.examItem.findMany({
      where: { valueNumeric: { not: null }, exam: { patientId: pidFilter } },
      include: { exam: { select: { performedAt: true, createdAt: true } } },
    });
    // Agrupa por analito e aplica o MESMO dedup do timeseries → count == nº de pontos do gráfico.
    type P = { performedAt: Date | null; createdAt: Date; valueNumeric: number };
    const byName = new Map<string, P[]>();
    for (const r of rows) {
      const arr = byName.get(r.nameCanonical) ?? [];
      arr.push({ performedAt: r.exam.performedAt, createdAt: r.exam.createdAt, valueNumeric: r.valueNumeric! });
      byName.set(r.nameCanonical, arr);
    }
    const out: { nameCanonical: string; count: number }[] = [];
    for (const [nameCanonical, items] of byName) {
      // dedup por dia: mantém o item de maior createdAt de cada dia (igual timeseries).
      const byDay = new Map<string, P>();
      for (const it of items) {
        const day = it.performedAt ? new Date(it.performedAt).toDateString() : 's/d';
        const prev = byDay.get(day);
        if (!prev || new Date(it.createdAt).getTime() > new Date(prev.createdAt).getTime()) byDay.set(day, it);
      }
      // dedup cross-day: mesma medição em datas adjacentes (janela 3d, tol 1%) vira 1 ponto.
      const deduped = collapseAdjacentNearDupes(
        [...byDay.values()],
        (p) => new Date(p.performedAt ?? 0).getTime(),
        (p) => p.valueNumeric,
      );
      out.push({ nameCanonical, count: deduped.length });
    }
    out.sort((a, b) => a.nameCanonical.localeCompare(b.nameCanonical));
    res.json(out);
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
    // Dedup por (analito + DIA): várias medições do mesmo analito no MESMO dia viram 1 ponto só.
    // Mantém a mais recente do dia (rows vêm orderBy performedAt asc, então o último set do dia vence).
    // Antes o dedup exigia valor IDÊNTICO — 2 medições no mesmo dia com valores ligeiramente diferentes
    // (2 extrações do mesmo PDF, 2 laboratórios, arredondamento) não colapsavam: geravam 2 pontos no
    // mesmo dia, a linha do gráfico "caía" entre eles e o tooltip repetia a data. (#9)
    const byName = new Map<string, Map<string, any>>();
    for (const r of rows) {
      const day = r.exam.performedAt ? new Date(r.exam.performedAt).toDateString() : 's/d';
      let dayMap = byName.get(r.nameCanonical);
      if (!dayMap) { dayMap = new Map(); byName.set(r.nameCanonical, dayMap); }
      dayMap.set(day, r); // sobrescreve: a última medição daquele dia vence (mais recente)
    }
    const out: any[] = [];
    for (const [name, dayMap] of byName) {
      // DEDUP cross-day: mesma medição em datas adjacentes (ex.: TSH 05/03 + 06/03 = 25.7) vira 1 ponto.
      const items = collapseAdjacentNearDupes(
        [...dayMap.values()],
        (i) => new Date(i.exam.performedAt ?? 0).getTime(),
        (i) => i.valueNumeric!,
      ); // 1 ponto por dia (pós cross-day), ordem asc
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
      // GUARD anti-cruzamento de escala: se a série mistura unidades (ex.: pg/mL + nmol/L no mesmo
      // nameCanonical), NÃO calcular tendência/previsão — a regressão cruzaria escalas ("+182/mês").
      const distinctUnits = new Set(items.map((i) => (i.unit ?? '').trim()).filter(Boolean));
      const mixedUnits = distinctUnits.size > 1;
      if (!mixedUnits && Math.abs(slope) > 0.0001 && (Math.abs(slope) * 365) / span > 0.02) dir = slope > 0 ? 'up' : 'down';
      let predictMonths: number | null = null;
      const refLow = items[0].refLow, refHigh = items[0].refHigh;
      if (!mixedUnits && dir !== 'stable' && (refLow != null || refHigh != null)) {
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
        // 'abnormal' = isAbnormal STORED do último item (já passa pelo reconcileScaleFlag, que
        // rebaixa conflitos de escala a UNKNOWN). Alinha o 'fora da faixa' da Evolução com o
        // Dashboard/CurrentStateCard — antes o recompute (inRange) ignorava a reconciliação e
        // contava marcadores incertos (conflito de escala) como 'fora', inflando o número.
        abnormal: !!last.isAbnormal,
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

// EXPLICA um exame/analito em linguagem simples. Cache em banco (exam_knowledge) primeiro;
// só chama a IA se não tiver (ou se a versão do prompt mudou) — e então grava pra reaproveitar.
// Próximos usuários que clicarem pegam do banco, sem chamar a IA. Ver analysis/explain.ts.
router.post('/explain', async (req: AuthedRequest, res) => {
  try {
    const name = String((req.body as any)?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: 'name obrigatório' }); return; }
    const data = await getOrCreateExplanation(name);
    res.json(data);
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
      include: { exam: { select: { id: true, title: true, performedAt: true, sourceLab: true, requestingDoctor: true, rawExtraction: true } } },
      take: 300,
    });
    res.json({ items: rows.map((i) => ({ id: i.id, examId: i.exam.id, name: i.name, nameCanonical: i.nameCanonical, valueText: i.valueText, valueNumeric: i.valueNumeric, unit: i.unit, flag: i.flag, refText: i.refText, refLow: i.refLow, refHigh: i.refHigh, examTitle: i.exam.title, performedAt: i.exam.performedAt, requestingDoctor: i.exam.requestingDoctor || (i.exam.rawExtraction as any)?.requestingDoctor || null })) });
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
