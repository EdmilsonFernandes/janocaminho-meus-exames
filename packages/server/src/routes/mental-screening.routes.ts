import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { getSettings } from '../utils/settings';
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
// 05/10: 1ª resposta de cada instrumento = recompensa (+grants.mentalScreening), UMA VEZ
// NA VIDA por tipo (pedido do dono: responder de novo NÃO paga de novo — o re-rastreio
// periódico é pelo acompanhamento, não pelo crédito). Guarda no ledger: kind='screening'
// + refId=type. Resposta traz `reward` pro front celebrar; null = já premiado antes.
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

    // Recompensa UMA vez por tipo (best-effort: falha não derruba o rastreio).
    let reward: { credits: number } | null = null;
    try {
      const amount = Math.max(0, Number(getSettings().grants?.mentalScreening ?? 3));
      if (amount > 0) {
        await prisma.$transaction(async (tx) => {
          const already = await tx.creditTransaction.findFirst({
            where: { userId: req.userId!, kind: 'screening', refId: type },
            select: { id: true },
          });
          if (already) return; // já premiou este instrumento (uma vez na vida)
          await tx.user.update({ where: { id: req.userId! }, data: { credits: { increment: amount } } });
          await tx.creditTransaction.create({ data: { userId: req.userId!, delta: amount, kind: 'screening', refId: type, label: type === 'phq9' ? 'Rastreamento de humor (PHQ-9)' : 'Rastreamento de ansiedade (GAD-7)' } });
          reward = { credits: amount };
        });
      }
    } catch (e) { console.error('[mental-screening] recompensa falhou:', (e as Error).message); }

    res.status(201).json({ ...serialize(created), reward });
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

// MAIS RECENTES por instrumento → { phq9, gad7 } (null quando nunca fez) +
// <tipo>Previous = registro anterior do mesmo instrumento (G3: chip "↓4 desde setembro"
// no dashboard — comparar com o próprio histórico, não entre instrumentos).
router.get('/:patientId/mental-screenings/latest', async (req: AuthedRequest, res, next) => {
  try {
    const pid = String(req.params.patientId);
    const pids = await userPatientIds(req.userId!);
    if (!pids.includes(pid)) { res.status(403).json({ error: 'Paciente não pertence ao usuário' }); return; }
    const [phq9Rows, gad7Rows] = await Promise.all([
      prisma.mentalHealthScreening.findMany({ where: { patientId: pid, type: 'phq9' }, orderBy: { createdAt: 'desc' }, take: 2, select: SELECT }),
      prisma.mentalHealthScreening.findMany({ where: { patientId: pid, type: 'gad7' }, orderBy: { createdAt: 'desc' }, take: 2, select: SELECT }),
    ]);
    res.json({
      phq9: phq9Rows[0] ? serialize(phq9Rows[0]) : null,
      gad7: gad7Rows[0] ? serialize(gad7Rows[0]) : null,
      phq9Previous: phq9Rows[1] ? serialize(phq9Rows[1]) : null,
      gad7Previous: gad7Rows[1] ? serialize(gad7Rows[1]) : null,
    });
  } catch (e) {
    if (isTableMissing(e)) { res.setHeader('X-Table-Missing', 'true'); res.json({ phq9: null, gad7: null, phq9Previous: null, gad7Previous: null }); return; }
    next(e);
  }
});

export default router;
