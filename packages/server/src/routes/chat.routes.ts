import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { streamChat } from '../analysis/chat';

const router = Router();
router.use(requireAuth);

// CHAT global (contexto = exames recentes do paciente) — streaming SSE
router.post('/', async (req: AuthedRequest, res, next) => {
  try {
    const message = String((req.body as any)?.message ?? '');
    if (!message) {
      res.status(400).json({ error: 'message obrigatório' });
      return;
    }
    const pids = await userPatientIds(req.userId!);

    const recent = await prisma.exam.findMany({
      where: { patientId: { in: pids }, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      take: 6,
      include: { items: { where: { isAbnormal: true } } },
    });
    const patient = pids[0] ? await prisma.patient.findUnique({ where: { id: pids[0] } }) : null;

    const contextText =
      `Resumo dos exames recentes do paciente:\n` +
      (recent.length
        ? recent
            .map(
              (e) =>
                `- ${e.title} (${e.performedAt?.toISOString().slice(0, 10) ?? 's/d'}): ${e.items.length} valor(es) fora da faixa`,
            )
            .join('\n')
        : '(ainda não há exames extraídos)') +
      (patient?.clinicalProfile ? `\nPerfil clínico: ${patient.clinicalProfile}` : '');

    const { text, model } = await streamChat({ res, contextText, history: [], message });
    await prisma.aiAnalysis.create({
      data: { type: 'CHAT', patientId: pids[0] ?? null, userMessage: message, contentMd: text, modelUsed: model },
    });
  } catch (e) {
    if (!res.headersSent) next(e);
    else console.error('[chat.global] erro no stream:', e);
  }
});

export default router;
