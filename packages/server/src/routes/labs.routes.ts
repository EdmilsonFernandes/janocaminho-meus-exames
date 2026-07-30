import { Router } from 'express';
import fs from 'fs';
import { prisma } from '../prisma';
import { resolvePatientPhoto } from '../utils/storage';

const router = Router();

// Cache em memória (labs mudam só quando admin edita — invalidado em /admin/labs). TTL 5min de rede.
let _cache: { at: number; labs: any[] } | null = null;
const TTL = 5 * 60 * 1000;
export function invalidateLabsCache() { _cache = null; }

const slugify = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'lab';

const serialize = (l: any) => ({ id: l.id, name: l.name, slug: l.slug, color: l.color, aliases: l.aliases, hasLogo: !!l.logoUrl });

// GET / — lista labs ativos (público, cacheado). Front casa sourceLab → marca por name/aliases.
router.get('/', async (_req, res, next) => {
  try {
    if (!_cache || Date.now() - _cache.at > TTL) {
      const labs = await prisma.lab.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
      _cache = { at: Date.now(), labs: labs.map(serialize) };
    }
    res.json({ labs: _cache.labs });
  } catch (e) { next(e); }
});

// GET /:id/logo — serve o logo (público, cacheável). Presigned S3 (redirect) ou sendFile (dev).
router.get('/:id/logo', async (req, res, next) => {
  try {
    const lab = await prisma.lab.findUnique({ where: { id: String(req.params.id) }, select: { logoUrl: true } });
    if (!lab?.logoUrl) { res.status(404).end(); return; }
    const r = await resolvePatientPhoto(lab.logoUrl);
    if (r.kind === 'url') { res.redirect(r.url); return; }
    if (fs.existsSync(r.file)) { res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); res.sendFile(r.file); return; }
    res.status(404).end();
  } catch (e) { next(e); }
});

export default router;
export { slugify };
