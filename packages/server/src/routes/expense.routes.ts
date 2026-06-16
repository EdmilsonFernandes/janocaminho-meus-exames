import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';

const router = Router();
router.use(requireAuth);

// LIST (escopo por paciente via ?patientId=)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const { start, take } = parseListParams(req);
    const pids = await userPatientIds(req.userId!);
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined;
    const where: any = { ownerId: req.userId };
    if (patientId && pids.includes(patientId)) where.patientId = patientId;
    const [total, rows] = await prisma.$transaction([
      prisma.expense.count({ where }),
      prisma.expense.findMany({ where, skip: start, take, orderBy: { spentAt: 'desc' } }),
    ]);
    setListHeaders(res, start, start + take, total);
    res.json(rows);
  } catch (e) { next(e); }
});

// CREATE
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { patientId, description, category, amount, spentAt } = req.body ?? {};
    const pids = await userPatientIds(req.userId!);
    if (!patientId || !pids.includes(patientId)) { res.status(403).json({ error: 'Paciente inválido' }); return; }
    if (!description || amount == null) { res.status(400).json({ error: 'Descrição e valor são obrigatórios' }); return; }
    const exp = await prisma.expense.create({
      data: {
        ownerId: req.userId!,
        patientId,
        description: String(description),
        category: String(category ?? 'Outro'),
        amount: Number(amount),
        spentAt: spentAt ? new Date(spentAt) : new Date(),
      },
    });
    res.status(201).json(exp);
  } catch (e) { next(e); }
});

// DELETE
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const exp = await prisma.expense.findUnique({ where: { id: String(req.params.id) } });
    if (!exp || exp.ownerId !== req.userId) { res.status(404).json({ error: 'Não encontrado' }); return; }
    await prisma.expense.delete({ where: { id: exp.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
