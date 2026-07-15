import { Router } from 'express';
import type { Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, requirePlan, AuthedRequest, userPatientIds } from '../middleware/auth';
import { generateHealthSummary, generateConsolidatedSummary, loadExamContext } from '../analysis/health-summary';
import { streamChat } from '../analysis/chat';
import { parseListParams, setListHeaders } from '../utils/list';
import { chargeCredits, CREDIT_COSTS } from '../utils/credits';

const router = Router();
router.use(requireAuth);

/** Carrega uma análise SÓ se pertencer ao usuário (via patientId direto ou exam.patientId).
 *  Sem isto, qualquer user autenticado lia/gerava-via-chat/compartilhava análise IA de exame
 *  alheio (IDOR — vazamento de resumo de saúde). */
async function loadOwnedAnalysis(req: AuthedRequest, res: Response, id: string | string[]): Promise<any | null> {
  const aid = Array.isArray(id) ? id[0] : id;
  const a = await prisma.aiAnalysis.findUnique({ where: { id: aid } });
  if (!a) { res.status(404).json({ error: 'Análise não encontrada' }); return null; }
  const pid = a.patientId
    ?? (a.examId ? (await prisma.exam.findUnique({ where: { id: a.examId }, select: { patientId: true } }))?.patientId : null);
  const pids = await userPatientIds(req.userId!);
  if (!pid || !pids.includes(pid)) { res.status(404).json({ error: 'Análise não encontrada' }); return null; }
  return a;
}

// DEDUP por (data + título normalizado): exame reenviado (arquivo diferente, mesmo conteúdo)
// ou painel duplicado não vira 2 linhas no relatório — keep o mais recente. Antes o take:5
// listava ~4 entradas repetidas do mesmo dia quando o paciente re-enviava o exame.
type SourceExam = { id: string; title: string; performedAt: Date | null; sourceLab: string | null; kind: string };
function dedupSourceExams(exams: SourceExam[]): SourceExam[] {
  const norm = (s: string) => (s ?? '').toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  const out: SourceExam[] = [];
  for (const e of exams) {
    const day = e.performedAt ? new Date(e.performedAt).toISOString().slice(0, 10) : 's/d';
    const key = `${day}|${norm(e.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// CRIAR resumo de um exame (SUMMARY)
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const { examId } = req.body ?? {};
    if (!examId) {
      res.status(400).json({ error: 'examId obrigatório' });
      return;
    }
    // IDOR guard: o exame precisa pertencer ao usuário (senão gera resumo IA de exame alheio).
    const pids = await userPatientIds(req.userId!);
    const examRow = await prisma.exam.findUnique({ where: { id: examId }, select: { rawExtraction: true, patientId: true } });
    if (!examRow || !pids.includes(examRow.patientId)) {
      res.status(404).json({ error: 'Exame não encontrado' });
      return;
    }
    // bloqueio forte anti-fraude: CPF no documento ≠ CPF cadastrado não permite atesto manual.
    const identity = (examRow?.rawExtraction as any)?.identityMatch;
    if (identity?.method === 'cpf' && identity?.mismatch) {
      res.status(403).json({ error: 'cpf_mismatch', message: 'O CPF detectado no exame diverge do CPF cadastrado neste perfil. Exclua o exame ou acione o suporte.' });
      return;
    }
    // bloqueio suave anti-fraude: nome no documento ≠ perfil exige atesto de titularidade
    const nm = (examRow?.rawExtraction as any)?.nameMatch;
    if (nm?.mismatch && !(examRow?.rawExtraction as any)?.nameAttested) {
      res.status(403).json({ error: 'name_mismatch', message: `O nome no documento (${nm.docName}) difere do perfil (${nm.profileName}). Confirme a titularidade deste exame antes de gerar a análise.` });
      return;
    }
    // 1 resumo por exame: se já existe, devolve (não gasta tokens de novo).
    // Se force=true, REGENERA (cobra de novo).
    const existing = await prisma.aiAnalysis.findFirst({ where: { examId, type: 'SUMMARY' }, orderBy: { createdAt: 'desc' } });
    if (existing && !req.body?.force) { res.json(existing); return; }
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { credits: true } });
    if ((me?.credits ?? 0) < CREDIT_COSTS.summary) {
      res.status(402).json({ error: 'insufficient_credits', message: 'Sem créditos suficientes. Compre um pacote de créditos para gerar análises com IA.' });
      return;
    }
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
    await chargeCredits(req.userId!, CREDIT_COSTS.summary, 'ai_summary', 'Resumo do exame', analysis.id);
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
    const sourceExams = dedupSourceExams(await prisma.exam.findMany({
      where: { patientId, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, performedAt: true, sourceLab: true, kind: true },
    })).slice(0, 5);
    // dedup: se já existe resumo consolidado há menos de 1h, devolve (economiza tokens)
    const recent = await prisma.aiAnalysis.findFirst({
      where: { patientId, type: 'SUMMARY', examId: null, userMessage: null, createdAt: { gt: new Date(Date.now() - 3600_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent && !req.body?.force) { res.json({ ...recent, sourceExams }); return; }
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { credits: true } });
    if ((me?.credits ?? 0) < CREDIT_COSTS.consolidated) {
      res.status(402).json({ error: 'insufficient_credits', message: 'Sem créditos suficientes. Compre um pacote para gerar o relatório completo.' });
      return;
    }
    try {
      const { summary, contentMd, modelUsed, usage } = await generateConsolidatedSummary(patientId);
      // UPSERT: 1 resumo consolidado por paciente (atualiza o existente em vez de acumular duplicatas).
      const existing = await prisma.aiAnalysis.findFirst({ where: { patientId, type: 'SUMMARY', examId: null, userMessage: null }, orderBy: { createdAt: 'desc' } });
      const analysis = existing
        ? await prisma.aiAnalysis.update({ where: { id: existing.id }, data: { contentMd, structured: summary as any, modelUsed, tokenUsage: usage as any, createdAt: new Date() } })
        : await prisma.aiAnalysis.create({ data: { patientId, examId: null, type: 'SUMMARY', contentMd, structured: summary as any, modelUsed, tokenUsage: usage as any } });
      await chargeCredits(req.userId!, CREDIT_COSTS.consolidated, 'ai_consolidated', 'Relatório consolidado', analysis.id);
      res.status(201).json({ ...analysis, sourceExams });
    } catch (genErr: any) {
      // RAG: se a (re)geração falhou, devolve o ÚLTIMO relatório salvo em vez de erro
      const last = await prisma.aiAnalysis.findFirst({ where: { patientId, type: 'SUMMARY', examId: null, userMessage: null }, orderBy: { createdAt: 'desc' } });
      if (last) {
        console.warn('[consolidated] geração falhou — devolvendo último salvo:', genErr?.message);
        res.status(200).json({ ...last, sourceExams, fromCache: true, warning: 'Mostrando seu último relatório salvo (a regeração falhou: ' + (genErr?.message ?? 'erro de IA') + ').' });
        return;
      }
      throw genErr;
    }
  } catch (e: any) {
    console.error('[consolidated] erro ao gerar:', e?.status, e?.message);
    if (!res.headersSent) res.status(500).json({ error: 'Não foi possível gerar o relatório agora (serviço de IA). Tente novamente em instantes.' });
  }
});

// ÚLTIMO relatório consolidado salvo (não regenera — só mostra o que já existe, economiza créditos)
router.get('/consolidated/latest', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const patientId = String(req.query.patientId ?? '');
    if (!patientId || !pids.includes(patientId)) { res.json({ analysis: null, sourceExams: [] }); return; }
    const sourceExams = dedupSourceExams(await prisma.exam.findMany({
      where: { patientId, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, performedAt: true, sourceLab: true, kind: true },
    })).slice(0, 5);
    const last = await prisma.aiAnalysis.findFirst({ where: { patientId, type: 'SUMMARY', examId: null, userMessage: null }, orderBy: { createdAt: 'desc' } });
    res.json({ analysis: last, sourceExams });
  } catch (e) { next(e); }
});

// LIST (react-admin)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const { start, take } = parseListParams(req);
    const q = req.query as Record<string, string | undefined>;
    // IDOR guard: escopa por exames do usuário (senão lista análises de qualquer um).
    const pids = await userPatientIds(req.userId!);
    const userExamIds = (await prisma.exam.findMany({ where: { patientId: { in: pids } }, select: { id: true } })).map((e) => e.id);
    const where: any = {};
    if (q.examId) {
      where.examId = userExamIds.includes(q.examId) ? q.examId : '__none__'; // só se for do user
    } else {
      where.examId = { in: userExamIds };
    }
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
router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const a = await loadOwnedAnalysis(req, res, req.params.id);
    if (!a) return;
    res.json(a);
  } catch (e) {
    next(e);
  }
});

// CHAT num resumo (thread) — streaming SSE
router.post('/:id/chat', async (req: AuthedRequest, res, next) => {
  try {
    const parent = await loadOwnedAnalysis(req, res, String(req.params.id));
    if (!parent) return;
    if (!parent.examId) {
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
router.post('/:id/share', async (req: AuthedRequest, res, next) => {
  try {
    const a = await loadOwnedAnalysis(req, res, String(req.params.id));
    if (!a) return;
    const expires = Date.now() + 12 * 60 * 60 * 1000; // 12 horas
    const token = `${crypto.randomUUID()}.${expires}`;
    const pin = String(crypto.randomInt(100000, 1000000)); // CSPRNG (não Math.random — adivinhável)
    const pinHash = crypto.createHash('sha256').update(`${pin}:${token}`).digest('hex');
    await prisma.aiAnalysis.update({ where: { id: a.id }, data: { shareToken: token, sharePin: pinHash } });
    // base do sub-caminho (/minhasaude). WEB_BASE_PATH é a fonte; se vier vazio no container,
    // deriva do Referer da página (ela tá em /minhasaude/#/...). Sem isso o link nasce sem o
    // /minhasaude e o médico recebe 404 ("Cannot GET /api/public/shared/...").
    let base = (process.env.WEB_BASE_PATH ?? '').replace(/\/$/, '');
    if (!base) {
      const ref = req.get('referer') || req.get('referrer') || '';
      const m = ref.match(/^https?:\/\/[^/]+(\/[^/?#]+)/);
      if (m) base = m[1].replace(/\/$/, '');
    }
    const origin = process.env.WEB_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const link = `${origin}${base}/api/public/shared/${token}`;
    res.json({ link, token, pin, expiresAt: new Date(expires).toISOString() });
  } catch (e) { next(e); }
});

/** Revoga um link compartilhado: limpa token + PIN → a rota pública não acha mais (acesso cortado na hora). */
router.delete('/:id/share', async (req: AuthedRequest, res, next) => {
  try {
    const a = await loadOwnedAnalysis(req, res, String(req.params.id));
    if (!a) return;
    await prisma.aiAnalysis.update({ where: { id: a.id }, data: { shareToken: null, sharePin: null } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
