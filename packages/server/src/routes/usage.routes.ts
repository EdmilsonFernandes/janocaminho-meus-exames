// Medidor de telas (25/11/26). O app manda, em lote, quais telas a conta abriu; guardamos UMA
// linha por conta+tela+dia com o total do dia. Serve ao painel "Adoção" do admin: o banco só
// mostrava o que as pessoas GRAVAM (exame, remédio…) — telas de leitura eram invisíveis.
// Privacidade: só o caminho da rota, com ids trocados por ":id". Nunca dado clínico.
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const MAX_ITEMS = 40;
const MAX_VIEWS_PER_ITEM = 200;
const PLATFORMS = new Set(['android', 'ios', 'web']);

/** Aceita só caminho de rota já normalizado pelo app: "/tendencias", "/exams/:id/show". */
export function cleanScreen(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s.length < 1 || s.length > 80) return null;
  if (!/^\/[a-z0-9\-_/:]*$/.test(s)) return null;
  // id cru que escapou da normalização do app (cuid, uuid, número longo) → recusa em vez de guardar
  if (s.split('/').some((seg) => seg.length >= 16 || /^\d{3,}$/.test(seg))) return null;
  return s;
}

/** 'YYYY-MM-DD' de hoje em São Paulo (o dia do usuário, não o do servidor em UTC). */
export function brDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

// POST /api/usage/screens  body: { views: [{ screen, n }], platform? }
router.post('/screens', async (req: AuthedRequest, res, next) => {
  try {
    const list = Array.isArray(req.body?.views) ? (req.body.views as unknown[]).slice(0, MAX_ITEMS) : [];
    const platform = PLATFORMS.has(String(req.body?.platform)) ? String(req.body.platform) : null;
    const merged = new Map<string, number>();
    for (const it of list) {
      const screen = cleanScreen((it as { screen?: unknown })?.screen);
      if (!screen) continue;
      const n = Math.floor(Number((it as { n?: unknown })?.n));
      const add = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_VIEWS_PER_ITEM) : 1;
      merged.set(screen, Math.min((merged.get(screen) ?? 0) + add, MAX_VIEWS_PER_ITEM));
    }
    const day = brDay();
    for (const [screen, n] of merged) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO screen_views ("id", "userId", "screen", "day", "views", "platform", "firstAt", "lastAt")
        VALUES (${randomUUID()}, ${req.userId!}, ${screen}, ${day}, ${n}, ${platform}, now(), now())
        ON CONFLICT ("userId", "screen", "day")
        DO UPDATE SET "views" = screen_views."views" + EXCLUDED."views", "lastAt" = now(),
                      "platform" = COALESCE(EXCLUDED."platform", screen_views."platform")`);
    }
    res.json({ ok: true, saved: merged.size });
  } catch (e) { next(e); }
});

export default router;
