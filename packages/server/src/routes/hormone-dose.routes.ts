/**
 * Radar Hormonal — aplicações REGISTRADAS pelo paciente (13/11/26).
 *
 * Para quê: a curva do Radar supunha que toda aplicação acontecia no dia certo. Com o registro,
 * ela usa as datas reais (atraso, dose pulada) e o cruzamento com o exame de sangue fica confiável.
 *
 * Limites deliberados:
 *  - é um DIÁRIO do que a pessoa já fez; a API não sugere dose, dia nem esquema;
 *  - só o próprio paciente lê (nenhuma rota do médico expõe isto);
 *  - compoundId tem de estar no catálogo do Radar; dose e data passam por faixa plausível.
 */
import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { COMPOUND_CATALOG } from '../analysis/compound-explain';

const router = Router();
router.use(requireAuth);

const DAY_MS = 86_400_000;
const MAX_DOSE_MG = 5000;
const MAX_ROWS = 500;
const SELECT = { id: true, patientId: true, compoundId: true, doseMg: true, takenAt: true, note: true, createdAt: true } as const;

async function resolvePatient(req: AuthedRequest, raw: unknown): Promise<string | null> {
  const pids = await userPatientIds(req.userId!);
  if (typeof raw === 'string' && raw) return pids.includes(raw) ? raw : null;
  return pids[0] ?? null;
}

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pid = await resolvePatient(req, req.query.patientId);
    if (!pid) { res.status(404).json({ error: 'Paciente não encontrado.' }); return; }
    const items = await prisma.hormoneDose.findMany({ where: { patientId: pid }, orderBy: { takenAt: 'desc' }, take: MAX_ROWS, select: SELECT });
    res.json({ patientId: pid, items });
  } catch (e) { next(e); }
});

router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const pid = await resolvePatient(req, b.patientId);
    if (!pid) { res.status(404).json({ error: 'Paciente não encontrado.' }); return; }

    const compoundId = String(b.compoundId ?? '');
    if (!Object.prototype.hasOwnProperty.call(COMPOUND_CATALOG, compoundId)) { res.status(400).json({ error: 'Composto desconhecido.' }); return; }

    const doseMg = Number(b.doseMg);
    if (!Number.isFinite(doseMg) || doseMg <= 0 || doseMg > MAX_DOSE_MG) { res.status(400).json({ error: 'Dose fora da faixa aceita.' }); return; }

    const takenAt = b.takenAt ? new Date(b.takenAt) : new Date();
    const now = Date.now();
    if (Number.isNaN(takenAt.getTime())) { res.status(400).json({ error: 'Data inválida.' }); return; }
    // Diário do que JÁ aconteceu: nada no futuro (folga de 1 dia p/ fuso) nem mais antigo que 2 anos.
    if (takenAt.getTime() > now + DAY_MS || takenAt.getTime() < now - 730 * DAY_MS) { res.status(400).json({ error: 'Data fora do período aceito.' }); return; }

    const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 200) : null;
    const item = await prisma.hormoneDose.create({
      data: { patientId: pid, ownerId: req.userId!, compoundId, doseMg: Math.round(doseMg * 100) / 100, takenAt, note },
      select: SELECT,
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const row = await prisma.hormoneDose.findUnique({ where: { id: String(req.params.id) }, select: { id: true, patientId: true } });
    if (!row || !pids.includes(row.patientId)) { res.status(404).json({ error: 'Registro não encontrado.' }); return; }
    await prisma.hormoneDose.delete({ where: { id: row.id } });
    res.json({ id: row.id });
  } catch (e) { next(e); }
});

export default router;
