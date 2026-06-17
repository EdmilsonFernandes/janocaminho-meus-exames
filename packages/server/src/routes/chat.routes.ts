import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { streamChat } from '../analysis/chat';
import { memoryDigest, patientSlug, appendConversation } from '../analysis/agent-memory';
import { chargeCredits, CREDIT_COSTS } from '../utils/credits';

const router = Router();
router.use(requireAuth);

// HISTÓRICO da conversa do paciente (pra persistir entre sessões / reload)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const pids = await userPatientIds(req.userId!);
    const pid = String(req.query.patientId ?? req.headers['x-patient-id'] ?? '');
    if (!pid || !pids.includes(pid)) { res.json([]); return; }
    const turns = await prisma.aiAnalysis.findMany({
      where: { patientId: pid, type: 'CHAT' },
      orderBy: { createdAt: 'asc' },
      take: 40,
      select: { userMessage: true, contentMd: true },
    });
    res.json(turns);
  } catch (e) { next(e); }
});

// CHAT global — RAG: contexto = memória do paciente (historico.md) + exames + histórico da conversa
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const message = String((req.body as any)?.message ?? '');
    if (!message) { res.status(400).json({ error: 'message obrigatório' }); return; }
    const pids = await userPatientIds(req.userId!);
    const pid = String((req.body as any)?.patientId ?? req.headers['x-patient-id'] ?? pids[0] ?? '');
    if (!pid || !pids.includes(pid)) { res.status(403).json({ error: 'Paciente inválido' }); return; }

    const patient = await prisma.patient.findUnique({ where: { id: pid } });

    const recent = await prisma.exam.findMany({
      where: { patientId: pid, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      take: 6,
      include: { items: { where: { isAbnormal: true }, take: 8 } },
    });

    // RAG: memória do agente (análises anteriores do paciente)
    const slug = patientSlug(patient?.fullName ?? 'paciente', pid);
    const memory = memoryDigest(slug, 3);

    // histórico da conversa (últimos turnos deste paciente)
    const prior = await prisma.aiAnalysis.findMany({
      where: { patientId: pid, type: 'CHAT' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const history = prior
      .reverse()
      .flatMap((t) => [
        ...(t.userMessage ? [{ role: 'user' as const, content: t.userMessage }] : []),
        ...(t.contentMd ? [{ role: 'assistant' as const, content: t.contentMd }] : []),
      ])
      .slice(-12);

    const contextText =
      `Paciente: ${patient?.fullName ?? '—'}\n` +
      (patient?.clinicalProfile ? `Perfil clínico: ${patient.clinicalProfile}\n` : '') +
      `\nExames recentes:\n` +
      (recent.length
        ? recent
            .map((e) => `- ${e.title} (${e.performedAt ? new Date(e.performedAt as Date).toLocaleDateString('pt-BR') : 's/d'}): ${e.items.length} valor(es) alterado(s)`)
            .join('\n')
        : '(sem exames extraídos ainda)') +
      (memory ? `\n\nHISTÓRICO DE ANÁLISES ANTERIORES (memória do assistente — use como contexto, mantenha coerência, não repita):\n${memory}\n` : '');

    // gate de créditos (antes de iniciar o stream — não dá p/ abortar no meio do SSE)
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { credits: true } });
    if ((me?.credits ?? 0) < CREDIT_COSTS.chat) {
      res.status(402).json({ error: 'insufficient_credits', message: 'Sem créditos para conversar. Compre um pacote de créditos.' });
      return;
    }
    const { text, model } = await streamChat({ res, contextText, history, message });
    await prisma.aiAnalysis.create({
      data: { type: 'CHAT', patientId: pid, userMessage: message, contentMd: text, modelUsed: model },
    });
    await chargeCredits(req.userId!, CREDIT_COSTS.chat);
    // Persiste a conversa em .md (não se perde; vira memória durável do paciente)
    appendConversation(slug, message, text);
  } catch (e) {
    if (!res.headersSent) next(e);
    else console.error('[chat.global] erro no stream:', e);
  }
});

export default router;
