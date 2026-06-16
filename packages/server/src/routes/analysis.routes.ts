import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, requirePlan, AuthedRequest, userPatientIds } from '../middleware/auth';
import { generateHealthSummary, generateConsolidatedSummary, loadExamContext } from '../analysis/health-summary';
import { streamChat } from '../analysis/chat';
import { parseListParams, setListHeaders } from '../utils/list';

const router = Router();
router.use(requireAuth);

// CRIAR resumo de um exame (SUMMARY)
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { examId } = req.body ?? {};
    if (!examId) {
      res.status(400).json({ error: 'examId obrigatório' });
      return;
    }
    // 1 resumo por exame: se já existe, devolve (não gasta tokens de novo)
    const existing = await prisma.aiAnalysis.findFirst({ where: { examId, type: 'SUMMARY' }, orderBy: { createdAt: 'desc' } });
    if (existing) { res.json(existing); return; }
    const { summary, contentMd, modelUsed, usage } = await generateHealthSummary(examId);
    const analysis = await prisma.aiAnalysis.create({
      data: {
        examId,
        type: 'SUMMARY',
        contentMd,
        structured: summary as any,
        modelUsed,
        tokenUsage: usage as any,
      },
    });
    res.status(201).json(analysis);
  } catch (e: any) {
    if (!res.headersSent) next(e);
  }
});

// RESUMO CONSOLIDADO (multi-exame) — junta os últimos exames num documento único
router.post('/consolidated', async (req: AuthedRequest, res, next) => {
  try {
    const { patientId } = req.body ?? {};
    const pids = await userPatientIds(req.userId!);
    if (!patientId || !pids.includes(patientId)) {
      res.status(403).json({ error: 'Paciente inválido' });
      return;
    }
    // exames que serviram de base (mostrados no relatório + na impressão)
    const sourceExams = await prisma.exam.findMany({
      where: { patientId, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      take: 5,
      select: { title: true, performedAt: true, sourceLab: true, kind: true },
    });
    // dedup: se já existe resumo consolidado há menos de 1h, devolve (economiza tokens)
    const recent = await prisma.aiAnalysis.findFirst({
      where: { patientId, type: 'SUMMARY', examId: null, createdAt: { gt: new Date(Date.now() - 3600_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) { res.json({ ...recent, sourceExams }); return; }
    const { summary, contentMd, modelUsed, usage } = await generateConsolidatedSummary(patientId);
    const analysis = await prisma.aiAnalysis.create({
      data: { patientId, examId: null, type: 'SUMMARY', contentMd, structured: summary as any, modelUsed, tokenUsage: usage as any },
    });
    res.status(201).json({ ...analysis, sourceExams });
  } catch (e: any) {
    if (!res.headersSent) next(e);
  }
});

// LIST (react-admin)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const { start, take } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (q.examId) where.examId = q.examId;
    if (q.type) where.type = q.type;
    const [total, rows] = await prisma.$transaction([
      prisma.aiAnalysis.count({ where }),
      prisma.aiAnalysis.findMany({ where, skip: start, take, orderBy: { createdAt: 'desc' } }),
    ]);
    setListHeaders(res, start, start + take, total);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET ONE
router.get('/:id', async (req, res, next) => {
  try {
    const a = await prisma.aiAnalysis.findUnique({ where: { id: req.params.id } });
    if (!a) {
      res.status(404).json({ error: 'Análise não encontrada' });
      return;
    }
    res.json(a);
  } catch (e) {
    next(e);
  }
});

// CHAT num resumo (thread) — streaming SSE
router.post('/:id/chat', async (req: AuthedRequest, res, next) => {
  try {
    const parent = await prisma.aiAnalysis.findUnique({ where: { id: String(req.params.id) } });
    if (!parent || !parent.examId) {
      res.status(404).json({ error: 'Análise não encontrada' });
      return;
    }
    const message = String((req.body as any)?.message ?? '');
    if (!message) {
      res.status(400).json({ error: 'message obrigatório' });
      return;
    }

    const exam = await loadExamContext(parent.examId);
    const contextText =
      `Exame: ${exam.title} (${exam.kind})\n` +
      `Valores:\n${JSON.stringify(exam.items.map((i) => ({ name: i.name, value: i.valueText, ref: i.refText, flag: i.flag })), null, 2)}` +
      (exam.patient.clinicalProfile ? `\nPerfil clínico: ${exam.patient.clinicalProfile}` : '');

    const prior = await prisma.aiAnalysis.findMany({
      where: { parentAnalysisId: parent.id, type: 'CHAT' },
      orderBy: { createdAt: 'asc' },
    });
    const history = prior.flatMap((t) => [
      { role: 'user' as const, content: t.userMessage ?? '' },
      { role: 'assistant' as const, content: t.contentMd },
    ]);

    const { text, model } = await streamChat({ res, contextText, history, message });
    await prisma.aiAnalysis.create({
      data: {
        examId: parent.examId,
        type: 'CHAT',
        parentAnalysisId: parent.id,
        userMessage: message,
        contentMd: text,
        modelUsed: model,
      },
    });
    // resposta já foi encerrada via SSE
  } catch (e) {
    if (!res.headersSent) next(e);
    else console.error('[analysis.chat] erro no stream:', e);
  }
});

// COMPARTILHAR com médico — link temporário (12h) + PIN de 6 dígitos (enviado separadamente)
router.post('/:id/share', async (req, res, next) => {
  try {
    const a = await prisma.aiAnalysis.findUnique({ where: { id: String(req.params.id) } });
    if (!a) { res.status(404).json({ error: 'Análise não encontrada' }); return; }
    const expires = Date.now() + 12 * 60 * 60 * 1000; // 12 horas
    const token = `${crypto.randomUUID()}.${expires}`;
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const pinHash = crypto.createHash('sha256').update(`${pin}:${token}`).digest('hex');
    await prisma.aiAnalysis.update({ where: { id: a.id }, data: { shareToken: token, sharePin: pinHash } });
    const base = (process.env.WEB_BASE_PATH ?? '').replace(/\/$/, '');
    const origin = process.env.WEB_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const link = `${origin}${base}/api/public/shared/${token}`;
    res.json({ link, pin, expiresAt: new Date(expires).toISOString() });
  } catch (e) { next(e); }
});

export default router;
