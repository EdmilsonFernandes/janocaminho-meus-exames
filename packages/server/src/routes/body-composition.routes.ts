// Composição corporal (bioimpedância) — avaliações do paciente.
//  GET    /api/body-composition            lista (mais recente primeiro) + faixa de referência
//  POST   /api/body-composition/inbody-qr  lê o QR da folha InBody (dryRun=true só confere)
//  POST   /api/body-composition            registro manual (qualquer aparelho)
//  DELETE /api/body-composition/:id
// Educativo: mostra tendência e faixa; não conclui diagnóstico.
import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseInBodyQr, bodyFatReference } from '../bodycomp/inbody-qr';

const router = Router();
router.use(requireAuth);

// `select` explícito: tabela nova, sujeita a drift em produção (regra do projeto).
const SELECT = {
  id: true, patientId: true, measuredAt: true, source: true, deviceBrand: true, deviceModel: true,
  weightKg: true, heightCm: true, bodyFatPct: true, fatMassKg: true, skeletalMuscleKg: true,
  fatFreeMassKg: true, bodyWaterL: true, proteinKg: true, mineralKg: true, bmi: true, bmrKcal: true,
  waistHipRatio: true, visceralFatLevel: true, ranges: true, needsReview: true, note: true, createdAt: true,
} as const;

async function resolvePatient(req: AuthedRequest, wanted?: unknown): Promise<string | null> {
  const pids = await userPatientIds(req.userId!);
  if (typeof wanted === 'string' && pids.includes(wanted)) return wanted;
  return pids[0] ?? null;
}

const ageOf = (dob: Date | null | undefined, at = new Date()): number | null => {
  if (!dob) return null;
  let a = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
};

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pid = await resolvePatient(req, (req.query as any).patientId);
    if (!pid) { res.json({ items: [], reference: null }); return; }
    const [items, patient] = await Promise.all([
      prisma.bodyComposition.findMany({ where: { patientId: pid }, orderBy: { measuredAt: 'desc' }, take: 200, select: SELECT }),
      prisma.patient.findUnique({ where: { id: pid }, select: { gender: true, dateOfBirth: true, heightCm: true } }),
    ]);
    const ref = bodyFatReference(patient?.gender, ageOf(patient?.dateOfBirth));
    res.json({ items, reference: ref ? { bodyFatPct: ref } : null, profile: { heightCm: patient?.heightCm ?? null } });
  } catch (e) { next(e); }
});

router.post('/inbody-qr', async (req: AuthedRequest, res, next) => {
  try {
    const { payload, patientId, dryRun } = req.body ?? {};
    if (typeof payload !== 'string' || payload.length < 60 || payload.length > 4000) {
      res.status(400).json({ error: 'Envie o conteúdo do QR code da folha InBody.' });
      return;
    }
    const parsed = parseInBodyQr(payload);
    if (!parsed.ok) { res.status(422).json({ error: parsed.message, code: parsed.code }); return; }
    const r = parsed.reading;
    const preview = {
      measuredAt: r.measuredAt, deviceBrand: r.deviceBrand, deviceModel: r.deviceModel,
      weightKg: r.weightKg, heightCm: r.heightCm, bodyFatPct: r.bodyFatPct, fatMassKg: r.fatMassKg,
      skeletalMuscleKg: r.skeletalMuscleKg, fatFreeMassKg: r.fatFreeMassKg, bodyWaterL: r.bodyWaterL,
      proteinKg: r.proteinKg, mineralKg: r.mineralKg, bmi: r.bmi, bmrKcal: r.bmrKcal,
      waistHipRatio: r.waistHipRatio, ranges: r.ranges, needsReview: r.needsReview,
    };
    if (dryRun) { res.json({ preview }); return; }

    const pid = await resolvePatient(req, patientId);
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    // Mesma folha lida duas vezes não duplica a avaliação.
    const dup = await prisma.bodyComposition.findFirst({ where: { patientId: pid, source: 'INBODY_QR', measuredAt: r.measuredAt }, select: SELECT });
    if (dup) { res.json({ item: dup, duplicate: true }); return; }
    const item = await prisma.bodyComposition.create({
      data: {
        patientId: pid, measuredAt: r.measuredAt, source: 'INBODY_QR', deviceBrand: r.deviceBrand, deviceModel: r.deviceModel,
        weightKg: r.weightKg, heightCm: r.heightCm, bodyFatPct: r.bodyFatPct, fatMassKg: r.fatMassKg,
        skeletalMuscleKg: r.skeletalMuscleKg, fatFreeMassKg: r.fatFreeMassKg, bodyWaterL: r.bodyWaterL,
        proteinKg: r.proteinKg, mineralKg: r.mineralKg, bmi: r.bmi, bmrKcal: r.bmrKcal, waistHipRatio: r.waistHipRatio,
        ranges: r.ranges, rawPayload: r.raw, parserVersion: r.parserVersion, needsReview: r.needsReview,
      },
      select: SELECT,
    });
    res.status(201).json({ item, duplicate: false });
  } catch (e) { next(e); }
});

/** Número opcional dentro de [min, max]; fora da faixa ou inválido → erro de validação. */
function optNum(body: any, key: string, min: number, max: number, errors: string[]): number | null {
  const raw = body?.[key];
  if (raw == null || raw === '') return null;
  const v = typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) { errors.push(key); return null; }
  return v;
}

router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const b = req.body ?? {};
    const pid = await resolvePatient(req, b.patientId);
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const errors: string[] = [];
    const weightKg = optNum(b, 'weightKg', 20, 300, errors);
    const bodyFatPct = optNum(b, 'bodyFatPct', 2, 75, errors);
    let fatMassKg = optNum(b, 'fatMassKg', 1, 200, errors);
    const skeletalMuscleKg = optNum(b, 'skeletalMuscleKg', 5, 80, errors);
    let fatFreeMassKg = optNum(b, 'fatFreeMassKg', 10, 150, errors);
    const bodyWaterL = optNum(b, 'bodyWaterL', 10, 90, errors);
    const visceralFatLevel = optNum(b, 'visceralFatLevel', 1, 59, errors);
    const bmrKcal = optNum(b, 'bmrKcal', 600, 4500, errors);
    const heightCm = optNum(b, 'heightCm', 100, 230, errors);
    if (errors.length) { res.status(400).json({ error: 'Confira os valores informados.', fields: errors }); return; }
    if (weightKg == null || (bodyFatPct == null && fatMassKg == null && skeletalMuscleKg == null)) {
      res.status(400).json({ error: 'Informe o peso e pelo menos % de gordura, massa de gordura ou massa muscular.' });
      return;
    }
    const rawDate = typeof b.measuredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.measuredAt) ? `${b.measuredAt}T12:00:00Z` : b.measuredAt;
    const measuredAt = rawDate ? new Date(rawDate) : new Date();
    if (Number.isNaN(measuredAt.getTime()) || measuredAt.getTime() > Date.now() + 48 * 3600 * 1000) {
      res.status(400).json({ error: 'Data inválida.' });
      return;
    }
    // Derivados simples (mesma conta que o aparelho faz) quando o usuário não informou.
    if (fatMassKg == null && bodyFatPct != null) fatMassKg = Math.round(weightKg * bodyFatPct) / 100;
    if (fatFreeMassKg == null && fatMassKg != null) fatFreeMassKg = Math.round((weightKg - fatMassKg) * 10) / 10;
    const pct = bodyFatPct ?? (fatMassKg != null ? Math.round((fatMassKg / weightKg) * 1000) / 10 : null);
    const patient = await prisma.patient.findUnique({ where: { id: pid }, select: { heightCm: true } });
    const h = heightCm ?? patient?.heightCm ?? null;
    const item = await prisma.bodyComposition.create({
      data: {
        patientId: pid, measuredAt, source: 'MANUAL',
        deviceBrand: b.deviceBrand ? String(b.deviceBrand).slice(0, 40) : null,
        deviceModel: b.deviceModel ? String(b.deviceModel).slice(0, 40) : null,
        weightKg, heightCm: h, bodyFatPct: pct, fatMassKg, skeletalMuscleKg, fatFreeMassKg, bodyWaterL, visceralFatLevel,
        bmrKcal: bmrKcal != null ? Math.round(bmrKcal) : null,
        bmi: h ? Math.round((weightKg / (h / 100) ** 2) * 10) / 10 : null,
        note: b.note ? String(b.note).slice(0, 280) : null,
      },
      select: SELECT,
    });
    res.status(201).json({ item });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const row = await prisma.bodyComposition.findFirst({ where: { id: String(req.params.id), patientId: { in: pids } }, select: { id: true } });
    if (!row) { res.status(404).json({ error: 'Avaliação não encontrada.' }); return; }
    await prisma.bodyComposition.delete({ where: { id: row.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
