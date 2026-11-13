// Composição corporal (bioimpedância) — avaliações do paciente.
//  GET    /api/body-composition            lista (mais recente primeiro) + faixa de referência
//  POST   /api/body-composition/inbody-qr  lê o QR da folha InBody (dryRun=true só confere)
//  POST   /api/body-composition/report     envia o LAUDO (PDF/foto, qualquer marca) → 202 { jobId }
//  GET    /api/body-composition/report/:id  status da leitura → PRÉVIA (nada é gravado)
//  POST   /api/body-composition            registro manual ou prévia do laudo confirmada
//  DELETE /api/body-composition/:id
// Educativo: mostra tendência e faixa; não conclui diagnóstico.
import { Router } from 'express';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { parseInBodyQr, bodyFatReference } from '../bodycomp/inbody-qr';
import { REPORT_INSTRUCTIONS, checkReportReading, looksLikeBodyComposition } from '../bodycomp/report-reader';
import { upload } from '../middleware/upload';
import { pdfToText } from '../extraction/pdfToText';
import { ocrPdfPages } from '../extraction/ocrPdf';
import { imageToText } from '../extraction/imageToText';
import { getLlm, getModel } from '../llm';
import { CREDIT_COSTS, chargeCredits, refundCredits } from '../utils/credits';
import { JSON_SUFFIX, extractJsonObject } from '../utils/json';

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

/** Leitura de laudo usa IA: teto por usuário (o upload de exame já tem o seu). */
const reportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req as AuthedRequest).userId ?? 'anon',
  skip: () => process.env.NODE_ENV !== 'production',
  message: { error: 'Limite diário de leitura de laudos atingido. Tente amanhã ou digite os valores.' },
});

/** Texto do laudo: PDF com texto → pdftotext; PDF escaneado → OCR por página; foto → OCR. */
async function reportText(buffer: Buffer, mimetype: string): Promise<string> {
  if (mimetype === 'application/pdf') {
    let text = '';
    try { text = await pdfToText(buffer); } catch { /* PDF inválido → tenta OCR */ }
    if (text.trim().length < 50) { try { text = await ocrPdfPages(buffer, 4); } catch { /* sem poppler/tesseract */ } }
    return text;
  }
  try { return await imageToText(buffer); } catch { return ''; }
}

/**
 * Leitura do laudo roda em SEGUNDO PLANO: OCR + IA passam fácil de 60s, e o proxy de produção
 * (nginx, padrão 60s) cortaria a requisição. POST devolve 202 { jobId }; a tela consulta
 * GET /report/:jobId até ficar pronto. Estado em memória (1 container), expira em 15 min,
 * e só o dono da tarefa a enxerga. Nada do laudo é gravado.
 */
type ReportJob = {
  userId: string;
  status: 'pending' | 'done' | 'error';
  preview?: Record<string, unknown>;
  dropped?: string[];
  error?: string;
  code?: string;
  expiresAt: number;
};
const reportJobs = new Map<string, ReportJob>();
const JOB_TTL_MS = 15 * 60 * 1000;
const pruneJobs = () => { const now = Date.now(); for (const [id, job] of reportJobs) if (job.expiresAt < now) reportJobs.delete(id); };

/** Lê o laudo inteiro e devolve a prévia ou o motivo da recusa. Nunca lança. */
export async function readReport(buffer: Buffer, mimetype: string): Promise<Pick<ReportJob, 'status' | 'preview' | 'dropped' | 'error' | 'code'>> {
  try {
    const text = (await reportText(buffer, mimetype)).slice(0, 15_000);
    if (text.trim().length < 50) {
      return { status: 'error', code: 'UNREADABLE', error: 'Não consegui ler o texto deste arquivo. Tente uma foto mais nítida, de frente e com boa luz, ou digite os valores.' };
    }
    if (!looksLikeBodyComposition(text)) {
      return { status: 'error', code: 'NOT_BODYCOMP', error: 'Este arquivo não parece um laudo de bioimpedância. Exames de sangue e imagem vão na tela de Exames.' };
    }
    const result = await getLlm().complete({
      messages: [{ role: 'user', content: `${REPORT_INSTRUCTIONS}\n\n=== TEXTO DO LAUDO (use EXATAMENTE estes dados; NUNCA invente) ===\n${text}\n${JSON_SUFFIX}` }],
      // Mesmo teto provado das outras extrações (com menos, o modelo pode gastar tudo pensando).
      maxTokens: 16000,
      model: getModel(),
    });
    let raw: unknown;
    try { raw = extractJsonObject(result.text); } catch {
      return { status: 'error', code: 'AI_FORMAT', error: 'Não consegui interpretar este laudo agora. Tente de novo ou digite os valores.' };
    }
    const checked = checkReportReading(raw, text);
    if (!checked.ok) return { status: 'error', code: checked.code, error: checked.message };
    const r = checked.reading;
    return {
      status: 'done',
      preview: { measuredAt: r.measuredAt ? r.measuredAt.toISOString() : null, deviceBrand: r.deviceBrand, deviceModel: r.deviceModel, ...r.values, needsReview: true },
      dropped: r.dropped,
    };
  } catch (e) {
    console.warn('[body-composition] leitura de laudo falhou:', (e as Error).message);
    return { status: 'error', code: 'FAILED', error: 'A leitura falhou agora. Tente de novo em instantes ou digite os valores.' };
  }
}

router.post('/report', reportLimiter, upload.single('file'), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Envie o PDF ou a foto do laudo.' }); return; }
    // Cobra ANTES de gastar IA (custo editável no admin: creditCosts.bodyReport; 0 = grátis).
    // Leitura que não termina em prévia (ilegível, não é bioimpedância, IA falhou) é estornada.
    const cost = Math.max(0, Math.round(CREDIT_COSTS.bodyReport ?? 0));
    if (cost > 0 && !(await chargeCredits(req.userId!, cost, 'body_report', 'Leitura de laudo de bioimpedância'))) {
      res.status(402).json({ error: `Você precisa de ${cost} créditos para ler o laudo. Digitar os valores continua grátis.`, code: 'INSUFFICIENT_CREDITS', cost });
      return;
    }
    pruneJobs();
    const jobId = randomUUID();
    const job: ReportJob = { userId: req.userId!, status: 'pending', expiresAt: Date.now() + JOB_TTL_MS };
    reportJobs.set(jobId, job);
    const { buffer, mimetype } = req.file;
    const userId = req.userId!;
    void readReport(buffer, mimetype).then(async (outcome) => {
      if (outcome.status === 'error' && cost > 0) {
        await refundCredits(userId, cost, 'body_report_refund', 'Estorno: laudo de bioimpedância não lido');
        outcome = { ...outcome, error: `${outcome.error} Seus créditos foram devolvidos.` };
      }
      Object.assign(job, outcome, { expiresAt: Date.now() + JOB_TTL_MS });
    });
    res.status(202).json({ jobId, cost });
  } catch (e) { next(e); }
});

router.get('/report/:jobId', (req: AuthedRequest, res) => {
  const job = reportJobs.get(String(req.params.jobId));
  if (!job || job.userId !== req.userId || job.expiresAt < Date.now()) { res.status(404).json({ error: 'Leitura não encontrada. Envie o laudo de novo.' }); return; }
  if (job.status === 'pending') { res.json({ status: 'pending' }); return; }
  if (job.status === 'error') { res.status(422).json({ status: 'error', error: job.error, code: job.code }); return; }
  res.json({ status: 'done', preview: job.preview, dropped: job.dropped });
});

/** Nome legível do app que gravou o dado no Health Connect (vira a "marca" da avaliação). */
const HC_ORIGINS: Record<string, string> = {
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.samsung.android.wear.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.withings.wiscale2': 'Withings',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.mi.health': 'Mi Fitness',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.renpho.health': 'Renpho',
};
const originLabel = (pkg: unknown) => {
  const p = typeof pkg === 'string' ? pkg.trim().slice(0, 80) : '';
  return HC_ORIGINS[p] ?? 'Health Connect';
};

/**
 * Importa avaliações lidas do Health Connect pelo app (relógio/balança inteligente).
 * Sem IA → grátis. Idempotente: a mesma medição (paciente + instante) não entra duas vezes,
 * então o app pode reenviar o histórico inteiro a cada sincronização.
 */
router.post('/health-connect', async (req: AuthedRequest, res, next) => {
  try {
    const { readings, patientId } = req.body ?? {};
    if (!Array.isArray(readings) || readings.length === 0 || readings.length > 200) {
      res.status(400).json({ error: 'Envie de 1 a 200 medições.' });
      return;
    }
    const pid = await resolvePatient(req, patientId);
    if (!pid) { res.status(400).json({ error: 'Nenhum paciente vinculado.' }); return; }
    const patient = await prisma.patient.findUnique({ where: { id: pid }, select: { heightCm: true } });

    const rows: Array<Record<string, unknown> & { measuredAt: Date }> = [];
    let invalid = 0;
    const seen = new Set<number>();
    for (const r of readings) {
      const at = new Date(typeof r?.time === 'string' ? r.time : NaN);
      const errors: string[] = [];
      const weightKg = optNum(r, 'weightKg', 20, 300, errors);
      const bodyFatPct = optNum(r, 'bodyFatPct', 2, 75, errors);
      const bmrKcal = optNum(r, 'bmrKcal', 600, 4500, errors);
      const heightIn = optNum(r, 'heightCm', 100, 230, errors);
      const leanKg = optNum(r, 'leanKg', 10, 150, errors);
      const waterKg = optNum(r, 'waterKg', 10, 90, errors);
      // Sem data válida, sem peso ou sem gordura não é uma avaliação; campo opcional fora da
      // faixa derruba só ele mesmo (errors), não a medição.
      if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 48 * 3600 * 1000 || at.getFullYear() < 2010 || weightKg == null || bodyFatPct == null) { invalid++; continue; }
      const key = Math.floor(at.getTime() / 1000);
      if (seen.has(key)) continue;
      seen.add(key);
      const measuredAt = new Date(key * 1000);
      const w = Math.round(weightKg * 10) / 10;
      const pct = Math.round(bodyFatPct * 10) / 10;
      const fatMassKg = Math.round(w * pct) / 100;
      const h = heightIn ?? patient?.heightCm ?? null;
      rows.push({
        patientId: pid, measuredAt, source: 'HEALTH_CONNECT', deviceBrand: originLabel(r?.origin), deviceModel: null,
        weightKg: w, heightCm: h != null ? Math.round(h * 10) / 10 : null, bodyFatPct: pct, fatMassKg,
        // Massa magra: a que o aparelho gravou; senão, a conta direta peso − gordura.
        fatFreeMassKg: leanKg != null ? Math.round(leanKg * 10) / 10 : Math.round((w - fatMassKg) * 10) / 10,
        bodyWaterL: waterKg != null ? Math.round(waterKg * 10) / 10 : null, // 1 kg de água ≈ 1 L
        bmrKcal: bmrKcal != null ? Math.round(bmrKcal) : null,
        bmi: h ? Math.round((w / (h / 100) ** 2) * 10) / 10 : null,
        parserVersion: 'health-connect@1',
      });
    }
    if (rows.length === 0) { res.status(400).json({ error: 'Nenhuma medição válida (é preciso peso e % de gordura).' }); return; }

    const existing = await prisma.bodyComposition.findMany({
      where: { patientId: pid, source: 'HEALTH_CONNECT', measuredAt: { in: rows.map((row) => row.measuredAt) } },
      select: { measuredAt: true },
    });
    const have = new Set(existing.map((e) => e.measuredAt.getTime()));
    const fresh = rows.filter((row) => !have.has(row.measuredAt.getTime()));
    if (fresh.length) await prisma.bodyComposition.createMany({ data: fresh as never });
    res.json({ imported: fresh.length, skipped: rows.length - fresh.length, invalid });
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
    const proteinKg = optNum(b, 'proteinKg', 2, 30, errors);
    const mineralKg = optNum(b, 'mineralKg', 1, 8, errors);
    const waistHipRatio = optNum(b, 'waistHipRatio', 0.55, 1.5, errors);
    const source = b.source === 'REPORT' ? 'REPORT' : 'MANUAL';
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
        patientId: pid, measuredAt, source,
        deviceBrand: b.deviceBrand ? String(b.deviceBrand).slice(0, 40) : null,
        deviceModel: b.deviceModel ? String(b.deviceModel).slice(0, 40) : null,
        weightKg, heightCm: h, bodyFatPct: pct, fatMassKg, skeletalMuscleKg, fatFreeMassKg, bodyWaterL, visceralFatLevel,
        proteinKg, mineralKg, waistHipRatio,
        parserVersion: source === 'REPORT' ? 'report-llm@1' : null,
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
