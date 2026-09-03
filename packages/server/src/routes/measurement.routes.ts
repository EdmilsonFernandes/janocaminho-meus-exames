import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds, firstPatientId } from '../middleware/auth';
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
    // Date-only ('2026-08-22') vira meia-noite UTC e EXIBE como o dia anterior no fuso BR
    // (peso de hoje aparecendo como ontem). Meio-dia UTC é imune a fuso ±11h. (QA 2026-08)
    const measuredAtRaw = typeof measuredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(measuredAt)
      ? `${measuredAt}T12:00:00Z`
      : measuredAt;
    const m = await prisma.measurement.create({
      data: {
        patientId: pid,
        type: String(type),
        value: Number(value),
        valueSecondary: valueSecondary != null ? Number(valueSecondary) : null,
        unit: unit ? String(unit) : '',
        measuredAt: new Date(measuredAtRaw),
        note: note ? String(note) : null,
      },
    });
    // Peso/PA alimentam o health-summary (IMC + cardiometabólico) — sem isto o card ficava
    // até 5min defasado após registrar peso (QA 2026-08: "Em dia" só aparecia no reload).
    const { invalidateHealthSummary } = await import('../analysis/hs-cache');
    invalidateHealthSummary(pid);
    res.status(201).json(m);
  } catch (e) { next(e); }
});

// ============================================================================
// "DESDE SEU ÚLTIMO EXAME" — compara baseline de atividade antes/depois do exame.
// Alimenta o card no Dashboard que mostra o que mudou no dia-a-dia entre exames.
// ============================================================================
router.get('/since-exam', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    const pid = q.patientId && pids.includes(q.patientId) ? q.patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    // Último exame EXTRAÍDO (a âncora temporal)
    const lastExam = await prisma.exam.findFirst({
      where: { patientId: pid, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      select: { performedAt: true },
    });
    if (!lastExam?.performedAt) { res.json({ hasData: false }); return; }

    const { compareBaselines } = await import('../analysis/activity-baseline');
    const comparison = await compareBaselines(pid, lastExam.performedAt);
    if (!comparison) { res.json({ hasData: false }); return; }

    // Pega também os exames alterados que mudaram no período (do snapshot Layer 2)
    const { buildCurrentHealthSummary } = await import('../analysis/health-state');
    const snapshot = await buildCurrentHealthSummary(pid, { includeStale: true });
    const examChanges = (snapshot.whatChanged ?? [])
      .filter((w) => w.deltaPct != null && Math.abs(w.deltaPct) >= 10)
      .slice(0, 5)
      .map((w) => ({
        name: w.name,
        direction: (w.trend === 'melhorou' || w.trend === 'reduzindo') ? 'improved' : (w.trend === 'piorou' || w.trend === 'aumentando') ? 'worsened' : 'stable',
        deltaPct: w.deltaPct,
      }));

    res.json({
      hasData: true,
      lastExamDate: lastExam.performedAt.toISOString().slice(0, 10),
      habitChanges: comparison.changes,
      examChanges,
      coverage: comparison.current.coverage,
    });
  } catch (e) { next(e); }
});

// ============================================================================
// CORRELAÇÕES — hábitos × exames com evidência científica (Fase 2).
// ============================================================================
router.get('/correlations', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    const pid = q.patientId && pids.includes(q.patientId) ? q.patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const { detectCorrelations } = await import('../analysis/correlation-engine');
    const findings = await detectCorrelations(pid);
    res.json({ findings });
  } catch (e) { next(e); }
});

// ============================================================================
// HEALTH CONNECT SYNC (Android) — upsert idempotente de atividade diária.
// O app (APK) agrega Passos/Calorias/Distância por dia via Health Connect e
// envia aqui. Persistimos como Measurements comuns → entram em Medições,
// Linha do Tempo e Evolução sem nenhuma tabela nova (mesma fonte da verdade).
// ============================================================================
export const ACTIVITY_TYPES = ['STEPS', 'CALORIES', 'DISTANCE'] as const;

router.post('/activity-sync', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, days } = req.body ?? {};
    // Perfil de destino da atividade do APARELHO: o celular é do TITULAR — passos/calorias
    // são DELE por natureza, INDEPENDENTE do perfil selecionado no momento do sync.
    // Bateria: body.patientId (chamada explícita/teste) → paciente Titular da conta
    // (firstPatientId) → pids[0]. ANTES caía sempre em pids[0] (ordem de criação): numa
    // conta cujo 1º paciente era um dependente, TODA atividade do Health Connect
    // aterrissava no perfil errado e o titular ficava sem dados nas telas compartilhadas.
    const pid = (patientId && pids.includes(patientId) ? patientId : undefined)
      ?? (await firstPatientId(req.userId!))
      ?? pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    if (!Array.isArray(days) || days.length === 0) { res.status(400).json({ error: 'days[] é obrigatório.' }); return; }
    if (days.length > 31) { res.status(400).json({ error: 'Máximo de 31 dias por sincronização.' }); return; }

    // Valida e normaliza UMA vez (fail-fast: nada é gravado se qualquer dia for inválido).
    const parsed: { date: string; rows: { type: string; value: number; unit: string; at: Date }[] }[] = [];
    for (const d of days) {
      const dateStr = String(d?.date ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { res.status(400).json({ error: `Data inválida: "${dateStr}" (esperado YYYY-MM-DD).` }); return; }
      const at = new Date(`${dateStr}T12:00:00`); // meio-dia: imune a TZ/dst na ordenação por dia
      if (Number.isNaN(at.getTime())) { res.status(400).json({ error: `Data inválida: ${dateStr}` }); return; }
      const steps = Math.max(0, Math.round(Number(d.steps ?? 0)));
      const kcal = Math.max(0, Number(d.kcal ?? 0));
      const km = Math.max(0, Number(d.km ?? 0));
      const hr = Math.max(0, Math.round(Number(d.hr ?? 0)));
      // Minutos de exercício formal (ExerciseSessionRecord) — o bridge já lia e o wrapper
      // descartava; agora entra no consolidado (tile "Exercício" + ActivityCard na web).
      const exerciseMin = Math.max(0, Math.round(Number(d.exerciseMin ?? 0)));
      if ([steps, kcal, km, hr, exerciseMin].some((v) => Number.isNaN(v))) { res.status(400).json({ error: `Valores inválidos em ${dateStr}.` }); return; }
      if (steps === 0 && kcal === 0 && km === 0 && hr === 0 && exerciseMin === 0) continue; // dia sem dados não gera ruído
      const rows = [
        ...(steps > 0 ? [{ type: 'STEPS', value: steps, unit: 'passos', at }] : []),
        ...(kcal > 0 ? [{ type: 'CALORIES', value: Math.round(kcal), unit: 'kcal', at }] : []),
        ...(km > 0 ? [{ type: 'DISTANCE', value: Number(km.toFixed(2)), unit: 'km', at }] : []),
        // FC média do dia (Health Connect) — alimenta o card de tendência de FC no Dashboard.
        ...(hr > 0 ? [{ type: 'HEART_RATE', value: hr, unit: 'bpm', at }] : []),
        ...(exerciseMin > 0 ? [{ type: 'EXERCISE_MINUTES', value: exerciseMin, unit: 'min', at }] : []),
      ];
      parsed.push({ date: dateStr, rows });
    }

    let synced = 0;
    await prisma.$transaction(async (tx) => {
      for (const { rows, date: dateStr } of parsed) {
        const dayStart = new Date(`${dateStr}T00:00:00`);
        const dayEnd = new Date(`${dateStr}T23:59:59.999`);
        // Idempotência POR MÉTRICA: só substitui a métrica que o payload traz (>0).
        // ANTES o dia INTEIRO era apagado — um build com leitura bugada (steps=0, km>0,
        // caso 403/404 com o bug da página de 1000 registros) APAGAVA passos válidos
        // do servidor a cada sync. Payload parcial agora PRESERVA o que não traz.
        const typesInPayload = rows.map((r) => r.type);
        await tx.measurement.deleteMany({ where: { patientId: pid, type: { in: typesInPayload }, note: 'Health Connect', measuredAt: { gte: dayStart, lte: dayEnd } } });
        for (const r of rows) {
          await tx.measurement.create({ data: { patientId: pid, type: r.type, value: r.value, unit: r.unit, measuredAt: r.at, note: 'Health Connect' } });
          synced++;
        }
      }
    });
    res.status(201).json({ synced, days: parsed.length });
  } catch (e) { next(e); }
});

// ============================================================================
// FC MÉDIA DIÁRIA (Health Connect) — série p/ o card de tendência no Dashboard.
// Só linhas do HC (note filter — medições manuais de FC ficam de fora), 7-90 dias.
// ============================================================================
router.get('/hr-trend', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    const pid = (q.patientId && pids.includes(q.patientId) ? q.patientId : undefined) ?? pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const days = Math.min(90, Math.max(7, Number(q.days ?? 30) || 30));
    const since = new Date(Date.now() - days * 86400000);
    const rows = await prisma.measurement.findMany({
      where: { patientId: pid, type: 'HEART_RATE', note: 'Health Connect', measuredAt: { gte: since } },
      orderBy: { measuredAt: 'asc' },
      select: { value: true, measuredAt: true },
    });
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      const key = r.measuredAt.toISOString().slice(0, 10);
      const acc = byDay.get(key) ?? { sum: 0, n: 0 };
      acc.sum += r.value; acc.n += 1;
      byDay.set(key, acc);
    }
    const series = [...byDay.entries()].map(([date, a]) => ({ date, avg: Math.round(a.sum / a.n) }));
    res.json({ days: series.length, series });
  } catch (e) { next(e); }
});

// ============================================================================
// ACTIVITY SUMMARY (consolidado) — a fonte da WEB (duas-fontes do ActivityCard).
// O APK lê o Health Connect direto pela bridge nativa; o navegador NÃO tem
// acesso ao dispositivo. Este endpoint consolida o que o APK JÁ sincronizou
// (mesma tabela measurements, note='Health Connect') numa resposta única por
// métrica: último valor, médias 7/30d, delta vs período anterior e séries
// diárias. lastSyncAt = max(createdAt) das rows (o sync é delete+create por
// dia → o createdAt da linha mais recente ≈ hora do último sync) — SEM
// coluna nova/SEM migration.
// ============================================================================
const ACTIVITY_METRICS = ['STEPS', 'CALORIES', 'DISTANCE', 'HEART_RATE', 'EXERCISE_MINUTES'] as const;
type ActivityMetric = (typeof ACTIVITY_METRICS)[number];
/** Meta diária de passos — espelha STEPS_GOAL do web (utils/activityStats.ts). */
const ACTIVITY_STEP_GOAL = 8000;
type MetricSummary = {
  latest: number | null; latestDate: string | null;
  goal?: number; goalPct?: number | null;
  avg7: number | null; avg30: number | null; prevAvg30: number | null; deltaPct30: number | null;
  series7: { date: string; value: number }[]; series30: { date: string; value: number }[];
};
/** DISTANCE guarda km com 2 decimais — round() genérico amassava 3,46 → 4. */
const rndMetric = (t: ActivityMetric, v: number) => (t === 'DISTANCE' ? Number(v.toFixed(2)) : Math.round(v));

router.get('/activity-summary', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    const pid = (q.patientId && pids.includes(q.patientId) ? q.patientId : undefined) ?? pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const days = Math.min(90, Math.max(7, Number(q.days ?? 30) || 30));
    const since = new Date(Date.now() - 2 * days * 86400000); // janela 2×: período atual + anterior
    const rows = await prisma.measurement.findMany({
      where: { patientId: pid, type: { in: [...ACTIVITY_METRICS] }, note: 'Health Connect', measuredAt: { gte: since } },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      select: { type: true, value: true, measuredAt: true, createdAt: true },
    });

    const emptyMetrics = (): Record<ActivityMetric, MetricSummary> => ({
      STEPS: { latest: null, latestDate: null, goal: ACTIVITY_STEP_GOAL, goalPct: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
      CALORIES: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
      DISTANCE: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
      HEART_RATE: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
      EXERCISE_MINUTES: { latest: null, latestDate: null, avg7: null, avg30: null, prevAvg30: null, deltaPct30: null, series7: [], series30: [] },
    });
    if (rows.length === 0) { res.json({ lastSyncAt: null, metrics: emptyMetrics() }); return; }

    // Dedup de LEITURA por type+dia: o sort é desc, o 1º visto é o mais recente do dia.
    // (O sync já é idempotente, mas rows de syncs distintos podem cruzar a janela 2×.)
    const byMetricDay = new Map<ActivityMetric, Map<string, number>>();
    let lastSyncAt: Date | null = null;
    for (const r of rows) {
      const t = r.type as ActivityMetric;
      if (!ACTIVITY_METRICS.includes(t)) continue;
      const day = r.measuredAt.toISOString().slice(0, 10);
      const daysMap = byMetricDay.get(t) ?? new Map<string, number>();
      if (!daysMap.has(day)) daysMap.set(day, r.value);
      byMetricDay.set(t, daysMap);
      if (!lastSyncAt || r.createdAt > lastSyncAt) lastSyncAt = r.createdAt;
    }

    const metrics = emptyMetrics();
    const cutoff = Date.now() - days * 86400000;
    for (const t of ACTIVITY_METRICS) {
      const daysMap = byMetricDay.get(t);
      if (!daysMap) continue;
      const entries = [...daysMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
      const inWindow = (e: { date: string }) => new Date(`${e.date}T12:00:00Z`).getTime() >= cutoff;
      const cur = entries.filter(inWindow);
      const prev = entries.filter((e) => !inWindow(e));
      const avg = (arr: { value: number }[]) => (arr.length ? arr.reduce((s, e) => s + e.value, 0) / arr.length : null);
      const avg7 = avg(cur.slice(-7));
      const avg30 = avg(cur.slice(-Math.min(30, days)));
      const prevAvg = avg(prev.slice(-days));
      const last = entries[entries.length - 1] ?? null;
      metrics[t] = {
        latest: last?.value ?? null,
        latestDate: last?.date ?? null,
        ...(t === 'STEPS' ? { goal: ACTIVITY_STEP_GOAL, goalPct: last ? Math.min(100, Math.round((last.value / ACTIVITY_STEP_GOAL) * 100)) : null } : {}),
        avg7: avg7 != null ? rndMetric(t, avg7) : null,
        avg30: avg30 != null ? rndMetric(t, avg30) : null,
        prevAvg30: prevAvg != null ? rndMetric(t, prevAvg) : null,
        deltaPct30: avg30 != null && prevAvg && prevAvg > 0 ? Math.round(((avg30 - prevAvg) / prevAvg) * 100) : null,
        series7: cur.slice(-7),
        series30: cur.slice(-30),
      };
    }
    res.json({ lastSyncAt: lastSyncAt?.toISOString() ?? null, metrics });
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
    const { invalidateHealthSummary } = await import('../analysis/hs-cache');
    invalidateHealthSummary(m.patientId);
    res.json({ id: m.id });
  } catch (e) { next(e); }
});

export default router;
