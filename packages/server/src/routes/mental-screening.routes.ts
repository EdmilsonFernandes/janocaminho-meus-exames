import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import {
  ScreeningType, validateScreeningAnswers, scoreScreening, severityOf, hasSuicidalIdeation,
} from '@meus-exames/shared';

/**
 * Rastreamento de saúde mental (PHQ-9 / GAD-7) — recurso GRATUITO (zero créditos/billing).
 * Montado em /api/patients (app.ts), depois do patientRoutes: os paths têm 2+ segmentos
 * (/:patientId/mental-screenings...) e não colidem com os /:id/* existentes.
 *
 * Drift gate: tabela nova → GETs degradam com lista vazia + X-Table-Missing quando a
 * migration ainda não rolou no banco (P2021 = "table does not exist"). POST falha normal
 * (400) — sem tabela não há onde salvar.
 */

const router = Router();
router.use(requireAuth);

/** Select explícito (drift gate): nunca leu colunas implícitas de tabela nova. */
const SELECT = { id: true, type: true, total: true, answers: true, createdAt: true } as const;

const serialize = (row: { id: string; type: string; total: number; answers: unknown; createdAt: Date }) => {
  const type = (row.type === 'gad7' ? 'gad7' : 'phq9') as ScreeningType;
  const answers = Array.isArray(row.answers) ? (row.answers as number[]) : [];
  return {
    id: row.id,
    type,
    total: row.total,
    answers,
    severity: severityOf(type, row.total),
    suicidalIdeation: type === 'phq9' ? hasSuicidalIdeation(answers) : false,
    createdAt: row.createdAt,
  };
};

const isTableMissing = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2021';

// REGISTRAR rastreamento — total calculado SERVER-SIDE (web nunca manda o score).
router.post('/:patientId/mental-screenings', async (req: AuthedRequest, res, next) => {
  try {
    const pid = String(req.params.patientId);
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(pid)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    const type = req.body?.type;
    if (type !== 'phq9' && type !== 'gad7') { res.status(400).json({ error: 'type deve ser "phq9" ou "gad7".' }); return; }
    const answers = req.body?.answers;
    if (!validateScreeningAnswers(type, answers)) {
      res.status(400).json({ error: `answers inválidas: informe ${type === 'phq9' ? 9 : 7} valores de 0 a 3.` });
      return;
    }
    const created = await prisma.mentalHealthScreening.create({
      data: { patientId: pid, type, total: scoreScreening(answers), answers: answers as any },
      select: SELECT,
    });
    res.status(201).json(serialize(created));
  } catch (e) { next(e); }
});

// HISTÓRICO — degrada com [] + X-Table-Missing se a migration ainda não rolou.
router.get('/:patientId/mental-screenings', async (req: AuthedRequest, res, next) => {
  try {
    const pid = String(req.params.patientId);
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(pid)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    const rows = await prisma.mentalHealthScreening.findMany({
      where: { patientId: pid },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: SELECT,
    });
    res.json(rows.map(serialize));
  } catch (e) {
    if (isTableMissing(e)) { res.setHeader('X-Table-Missing', 'true'); res.json([]); return; }
    next(e);
  }
});

// MAIS RECENTES por instrumento → { phq9, gad7 } (null quando nunca fez).
router.get('/:patientId/mental-screenings/latest', async (req: AuthedRequest, res, next) => {
  try {
    const pid = String(req.params.patientId);
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(pid)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    const [phq9, gad7] = await Promise.all([
      prisma.mentalHealthScreening.findFirst({ where: { patientId: pid, type: 'phq9' }, orderBy: { createdAt: 'desc' }, select: SELECT }),
      prisma.mentalHealthScreening.findFirst({ where: { patientId: pid, type: 'gad7' }, orderBy: { createdAt: 'desc' }, select: SELECT }),
    ]);
    res.json({ phq9: phq9 ? serialize(phq9) : null, gad7: gad7 ? serialize(gad7) : null });
  } catch (e) {
    if (isTableMissing(e)) { res.setHeader('X-Table-Missing', 'true'); res.json({ phq9: null, gad7: null }); return; }
    next(e);
  }
});

export default router;
