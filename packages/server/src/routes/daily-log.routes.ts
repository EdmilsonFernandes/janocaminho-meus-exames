// Diário de saúde diário (estudo Guava 21/11 — gap #1).
// UMA entrada por paciente+dia (upsert idempotente). Sintomas = keys normalizadas
// do catálogo abaixo (mesma filosofia do normalizeKey: sem acento, maiúsculo).
// Alimenta: streak (retenção), correlações com IA (gap #2) e o contexto do chat.
import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { computeDailyInsights, narrateDailyInsights } from '../analysis/daily-insights';

const router = Router();
router.use(requireAuth);

/** Catálogo canônico de sintomas (chips). Key = sem acento/maiúscula; label = exibição. */
export const SYMPTOM_CATALOG: { key: string; label: string }[] = [
  { key: 'DOR_CABECA', label: 'Dor de cabeça' },
  { key: 'CANSAICO', label: 'Cansaço' },
  { key: 'INSONIA', label: 'Insônia' },
  { key: 'DOR_CORPO', label: 'Dor no corpo' },
  { key: 'NAUSEA', label: 'Náusea' },
  { key: 'TONTURA', label: 'Tontura' },
  { key: 'ANSIEDADE', label: 'Ansiedade' },
  { key: 'FALTA_AR', label: 'Falta de ar' },
  { key: 'DOR_ABDOMINAL', label: 'Dor abdominal' },
  { key: 'FEBRE', label: 'Febre' },
];
const SYMPTOM_KEYS = new Set(SYMPTOM_CATALOG.map((s) => s.key));

/** 'YYYY-MM-DD' de hoje no fuso de São Paulo (o dia do usuário, não o do servidor UTC). */
function brToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// LIST — últimos N dias (default 30)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    let pid = pids[0];
    if (q.patientId && pids.includes(q.patientId)) pid = q.patientId;
    if (!pid) { res.json([]); return; }
    const days = Math.min(90, Math.max(7, Number(q.days ?? 30) || 30));
    const since = new Date(Date.now() - days * 86400000);
    const rows = await prisma.dailyLog.findMany({
      where: { patientId: pid, date: { gte: since } },
      orderBy: { date: 'desc' },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// STREAK — dias consecutivos com registro (terminando hoje ou ontem no fuso BR).
// Ontem conta: quem registra de manhã cedo não deve ver a streak zerada.
router.get('/streak', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    let pid = pids[0];
    if (q.patientId && pids.includes(q.patientId)) pid = q.patientId;
    if (!pid) { res.json({ streak: 0 }); return; }
    const rows = await prisma.dailyLog.findMany({
      where: { patientId: pid, date: { gte: new Date(Date.now() - 120 * 86400000) } },
      select: { date: true },
      orderBy: { date: 'desc' },
    });
    const dates = new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
    const today = brToday();
    const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
      .format(new Date(Date.now() - 86400000));
    let cursor = dates.has(today) ? today : dates.has(yesterday) ? yesterday : null;
    let streak = 0;
    while (cursor && dates.has(cursor)) {
      streak++;
      const d = new Date(`${cursor}T12:00:00Z`);
      cursor = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
        .format(new Date(d.getTime() - 86400000));
    }
    res.json({ streak });
  } catch (e) { next(e); }
});

// INSIGHTS (gap #2 — "Por que me sinto assim?"): estatística estruturada do
// diário × Health Connect + narração opcional da IA (que só traduz números).
router.get('/insights', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const q = req.query as Record<string, string | undefined>;
    let pid = q.patientId && pids.includes(q.patientId) ? q.patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const stats = await computeDailyInsights(pid);
    if (!stats.ready) {
      res.json({ ready: false, daysLogged: stats.daysLogged, insights: [], narration: null });
      return;
    }
    const patient = await prisma.patient.findUnique({ where: { id: pid }, select: { fullName: true } });
    const narration = await narrateDailyInsights(patient?.fullName ?? 'você', stats);
    res.json({ ...stats, narration });
  } catch (e) { next(e); }
});

// UPSERT — cria ou ATUALIZA o registro do dia (merge de sintomas: união).
// Body: { patientId?, date?: 'YYYY-MM-DD' (default hoje BR), symptoms?: string[],
//         mood?: 1-5, energy?: 1-5, note?: string, replaceSymptoms?: boolean }
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, date, symptoms, mood, energy, note, replaceSymptoms } = req.body ?? {};
    let pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }

    const dateStr = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : brToday();
    const dateOnly = new Date(`${dateStr}T12:00:00Z`); // meio-dia UTC: imune a fuso na ordenação
    if (Number.isNaN(dateOnly.getTime())) { res.status(400).json({ error: 'Data inválida.' }); return; }

    // Sintomas: só keys do catálogo (normaliza e rejeita lixo silenciosamente)
    const validSymptoms = Array.isArray(symptoms)
      ? [...new Set(symptoms.map((s: unknown) => String(s).toUpperCase()).filter((s: string) => SYMPTOM_KEYS.has(s)))]
      : undefined;
    const validMood = mood == null ? undefined : Math.min(5, Math.max(1, Math.round(Number(mood))));
    const validEnergy = energy == null ? undefined : Math.min(5, Math.max(1, Math.round(Number(energy))));
    if ((mood != null && Number.isNaN(validMood)) || (energy != null && Number.isNaN(validEnergy))) {
      res.status(400).json({ error: 'Humor/energia devem ser 1-5.' }); return;
    }
    if (validSymptoms?.length === 0 && validMood == null && validEnergy == null && !note && !replaceSymptoms) {
      res.status(400).json({ error: 'Nada para registrar.' }); return;
    }

    const existing = await prisma.dailyLog.findUnique({
      where: { patientId_date: { patientId: pid, date: dateOnly } },
    });
    const merged = replaceSymptoms
      ? (validSymptoms ?? existing?.symptoms ?? [])
      : existing
        ? [...new Set([...(existing.symptoms ?? []), ...(validSymptoms ?? [])])]
        : (validSymptoms ?? []);

    const row = await prisma.dailyLog.upsert({
      where: { patientId_date: { patientId: pid, date: dateOnly } },
      create: {
        patientId: pid,
        date: dateOnly,
        symptoms: merged,
        mood: validMood ?? null,
        energy: validEnergy ?? null,
        note: note ? String(note).slice(0, 500) : null,
      },
      update: {
        symptoms: { set: merged },
        ...(validMood != null ? { mood: validMood } : {}),
        ...(validEnergy != null ? { energy: validEnergy } : {}),
        ...(note != null ? { note: String(note).slice(0, 500) } : {}),
      },
    });
    res.status(existing ? 200 : 201).json(row);
  } catch (e) { next(e); }
});

export default router;
