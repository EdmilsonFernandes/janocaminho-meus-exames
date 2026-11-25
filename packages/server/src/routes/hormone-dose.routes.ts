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

// ── Protocolo cadastrado pela pessoa (25/11/26) ─────────────────────────────────────────────────
// Antes ficava só no localStorage do aparelho: o que se montava no app não aparecia na web.
// O servidor só GUARDA e DEVOLVE o cadastro dela — não calcula, não sugere esquema.
const MAX_PROTOCOL_ITEMS = 12;
const num = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** Valida e normaliza o protocolo vindo do app. null = formato inválido. */
export function cleanProtocol(raw: unknown): { protocol: unknown[]; weeks: number; startDate: string; variationPct: number } | null {
  const b = raw as { protocol?: unknown; weeks?: unknown; startDate?: unknown; variationPct?: unknown } | null;
  if (!b || !Array.isArray(b.protocol) || b.protocol.length < 1 || b.protocol.length > MAX_PROTOCOL_ITEMS) return null;
  const items: unknown[] = [];
  for (const it of b.protocol as Array<Record<string, unknown>>) {
    const compoundId = String(it?.compoundId ?? '');
    if (!Object.prototype.hasOwnProperty.call(COMPOUND_CATALOG, compoundId)) return null;
    const unit = it.unit === 'mg' ? 'mg' : it.unit === 'ml' ? 'ml' : null;
    const amount = num(it.amount, 0, 5000);
    const conc = num(it.conc, 0, 5000);
    const freqDays = num(it.freqDays, 0.5, 365);
    const startWeek = num(it.startWeek, 1, 104);
    const endWeek = num(it.endWeek, 1, 104);
    if (!unit || amount == null || conc == null || freqDays == null || startWeek == null || endWeek == null) return null;
    items.push({ uid: String(it.uid ?? items.length + 1).slice(0, 40), compoundId, unit, amount, conc, freqDays, startWeek, endWeek });
  }
  const startDate = typeof b.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.startDate) ? b.startDate : '';
  return { protocol: items, weeks: num(b.weeks, 1, 104) ?? 12, startDate, variationPct: num(b.variationPct, 0, 100) ?? 0 };
}

router.get('/protocol', async (req: AuthedRequest, res, next) => {
  try {
    const pid = await resolvePatient(req, req.query.patientId);
    if (!pid) { res.status(404).json({ error: 'Paciente não encontrado.' }); return; }
    const row = await prisma.hormoneProtocol.findUnique({ where: { patientId: pid }, select: { data: true, updatedAt: true } });
    res.json({ patientId: pid, data: row?.data ?? null, updatedAt: row?.updatedAt ?? null });
  } catch (e) { next(e); }
});

router.put('/protocol', async (req: AuthedRequest, res, next) => {
  try {
    const pid = await resolvePatient(req, req.body?.patientId);
    if (!pid) { res.status(404).json({ error: 'Paciente não encontrado.' }); return; }
    const data = cleanProtocol(req.body?.data);
    if (!data) { res.status(400).json({ error: 'Protocolo inválido.' }); return; }
    const row = await prisma.hormoneProtocol.upsert({
      where: { patientId: pid },
      create: { patientId: pid, ownerId: req.userId!, data: data as object },
      update: { data: data as object },
      select: { updatedAt: true },
    });
    res.json({ patientId: pid, data, updatedAt: row.updatedAt });
  } catch (e) { next(e); }
});

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
