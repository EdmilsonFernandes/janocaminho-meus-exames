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
      if ([steps, kcal, km].some((v) => Number.isNaN(v))) { res.status(400).json({ error: `Valores inválidos em ${dateStr}.` }); return; }
      if (steps === 0 && kcal === 0 && km === 0) continue; // dia sem dados não gera ruído
      const rows = [
        ...(steps > 0 ? [{ type: 'STEPS', value: steps, unit: 'passos', at }] : []),
        ...(kcal > 0 ? [{ type: 'CALORIES', value: Math.round(kcal), unit: 'kcal', at }] : []),
        ...(km > 0 ? [{ type: 'DISTANCE', value: Number(km.toFixed(2)), unit: 'km', at }] : []),
      ];
      parsed.push({ date: dateStr, rows });
    }

    let synced = 0;
    await prisma.$transaction(async (tx) => {
      for (const { rows, date: dateStr } of parsed) {
        const dayStart = new Date(`${dateStr}T00:00:00`);
        const dayEnd = new Date(`${dateStr}T23:59:59.999`);
        // Idempotente: re-sync do mesmo dia SUBSTITUI (sem duplicar histórico).
        await tx.measurement.deleteMany({ where: { patientId: pid, type: { in: [...ACTIVITY_TYPES] }, measuredAt: { gte: dayStart, lte: dayEnd } } });
        for (const r of rows) {
          await tx.measurement.create({ data: { patientId: pid, type: r.type, value: r.value, unit: r.unit, measuredAt: r.at, note: 'Health Connect' } });
          synced++;
        }
      }
    });
    res.status(201).json({ synced, days: parsed.length });
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
