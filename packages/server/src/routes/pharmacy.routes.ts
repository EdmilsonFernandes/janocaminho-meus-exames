/**
 * Admin: CRUD de farmácias VTEX — o worker lê daqui quais buscar.
 * Admin adiciona hostname + logo → nova farmácia entra no comparador SEM deploy.
 */
import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import type { Response, NextFunction } from 'express';

const router = Router();

// Middleware: só admin (role = ADMIN) — igual admin.routes.ts
const requireAdmin = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } });
    if (!u || u.role !== 'ADMIN') { res.status(403).json({ error: 'Acesso restrito a administradores.' }); return; }
    next();
  } catch { res.status(403).json({ error: 'Acesso restrito.' }); }
};
router.use(requireAuth, requireAdmin);

// LIST
router.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.pharmacyConfig.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(rows);
  } catch (e) { next(e); }
});

// CREATE
router.post('/', async (req, res, next) => {
  try {
    const { name, slug, hostname, logoUrl, color, sortOrder } = req.body ?? {};
    if (!name || !hostname) { res.status(400).json({ error: 'Nome e hostname são obrigatórios.' }); return; }
    const r = await prisma.pharmacyConfig.create({
      data: {
        name: String(name).trim(),
        slug: String(slug || name).toLowerCase().replace(/\s+/g, '-'),
        hostname: String(hostname).trim(),
        logoUrl: logoUrl ? String(logoUrl) : null,
        color: color ? String(color) : null,
        sortOrder: Number(sortOrder) || 99,
      },
    });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

// UPDATE (logo, cor, ativo, ordem)
router.patch('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.pharmacyConfig.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) { res.status(404).json({ error: 'Farmácia não encontrada.' }); return; }
    const { name, hostname, logoUrl, color, active, sortOrder } = req.body ?? {};
    const r = await prisma.pharmacyConfig.update({
      where: { id: existing.id },
      data: {
        name: name != null ? String(name).trim() : undefined,
        hostname: hostname != null ? String(hostname).trim() : undefined,
        logoUrl: logoUrl !== undefined ? String(logoUrl || '') || null : undefined,
        color: color !== undefined ? String(color || '') || null : undefined,
        active: typeof active === 'boolean' ? active : undefined,
        sortOrder: sortOrder != null ? Number(sortOrder) : undefined,
      },
    });
    res.json(r);
  } catch (e) { next(e); }
});

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.pharmacyConfig.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
