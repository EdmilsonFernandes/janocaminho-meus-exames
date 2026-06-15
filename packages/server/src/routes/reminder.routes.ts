import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseListParams, setListHeaders } from '../utils/list';

const router = Router();
router.use(requireAuth);

// LIST (próximos lembretes do paciente/owner)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { start, take } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const where: any = { ownerId: req.userId, patientId: { in: pids } };
    if (q.patientId && pids.includes(q.patientId)) where.patientId = q.patientId;
    if (q.done !== undefined) where.done = q.done === 'true';
    const [total, rows] = await prisma.$transaction([
      prisma.reminder.count({ where }),
      prisma.reminder.findMany({ where, skip: start, take, orderBy: { dueDate: 'asc' } }),
    ]);
    setListHeaders(res, start, start + take, total);
    res.json(rows);
  } catch (e) { next(e); }
});

// CREATE
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const { patientId, title, dueDate, note } = req.body ?? {};
    const pid = patientId && pids.includes(patientId) ? patientId : pids[0];
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente.' }); return; }
    if (!title || !dueDate) { res.status(400).json({ error: 'Título e data são obrigatórios.' }); return; }
    const r = await prisma.reminder.create({
      data: { ownerId: req.userId!, patientId: pid, title: String(title), dueDate: new Date(dueDate), note: note ? String(note) : null },
    });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

// UPDATE (marcar feito / editar)
router.put('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.reminder.findUnique({ where: { id: String(req.params.id) } });
    if (!existing || existing.ownerId !== req.userId) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    const { title, dueDate, note, done } = req.body ?? {};
    const data: any = {};
    if (title != null) data.title = String(title);
    if (dueDate != null) data.dueDate = new Date(dueDate);
    if (note != null) data.note = String(note);
    if (done != null) data.done = Boolean(done);
    res.json(await prisma.reminder.update({ where: { id: existing.id }, data }));
  } catch (e) { next(e); }
});

// DELETE
router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.reminder.findUnique({ where: { id: String(req.params.id) } });
    if (!existing || existing.ownerId !== req.userId) { res.status(404).json({ error: 'Lembrete não encontrado' }); return; }
    await prisma.reminder.delete({ where: { id: existing.id } });
    res.json({ id: existing.id });
  } catch (e) { next(e); }
});

export default router;
