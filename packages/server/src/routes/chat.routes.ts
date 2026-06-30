import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { streamChat } from '../analysis/chat';
import { memoryDigest, patientSlug, appendConversation } from '../analysis/agent-memory';
import { chargeCredits, CREDIT_COSTS } from '../utils/credits';
import { tryLocalAnswer, streamLocalAnswer } from '../analysis/chat-router';

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

    // PRÉ-ROTEADOR: pergunta factual → responde do banco (token zero, grátis). Só interpretativa vai à IA.
    const local = await tryLocalAnswer({ message, userId: req.userId!, patientId: pid });
    if (local.answered && local.text != null) {
      streamLocalAnswer(res, local.text);
      await prisma.aiAnalysis.create({ data: { type: 'CHAT', patientId: pid, userMessage: message, contentMd: local.text, modelUsed: 'local-router' } });
      console.log('[chat] router_hit (resposta local, sem IA)');
      return;
    }
    console.log('[chat] router_miss → IA');

    const patient = await prisma.patient.findUnique({ where: { id: pid } });

    const recent = await prisma.exam.findMany({
      where: { patientId: pid, status: 'EXTRACTED' },
      orderBy: { performedAt: 'desc' },
      take: 8,
      // SEM filtro isAbnormal: a IA precisa ver TODOS os analitos (TGO/TGP normais inclusos),
      // senão responde "você não tem esse exame". take 30 cobre painéis grandes sem estourar o contexto.
      include: { items: { take: 30, orderBy: { name: 'asc' } } },
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

    // Helpers p/ formatar valores dos itens — a IA PRECISA dos valores (não só títulos) pra responder
    // com precisão (valores fora da faixa, comparação, evolução, etc.).
    const fmtDate = (d: Date | string | null) => (d ? new Date(d as any).toLocaleDateString('pt-BR') : 's/d');
    const fmtVal = (it: any) => it.valueText ?? (it.valueNumeric != null ? String(it.valueNumeric).replace('.', ',') : '—');
    const fmtRef = (it: any) => it.refText ?? (it.refLow != null && it.refHigh != null ? `${String(it.refLow).replace('.', ',')}-${String(it.refHigh).replace('.', ',')}` : null);
    const fmtFlag = (it: any) => (it.flag === 'HIGH' ? 'acima' : it.flag === 'LOW' ? 'abaixo' : it.flag === 'CRITICAL' ? 'crítico' : (it.isAbnormal ? 'alterado' : ''));
    const fmtItem = (it: any) => `${it.name}: ${fmtVal(it)}${it.unit ? ' ' + it.unit : ''}${fmtRef(it) ? ` (ref ${fmtRef(it)})` : ''}${fmtFlag(it) ? ` [${fmtFlag(it)}]` : ''}`;

    // Per-exam: exames recentes com TODOS os itens (valor + faixa + flag se alterado).
    const examsBlock = recent.length
      ? recent
          .map((e) => {
            const itens = (e.items as any[]).map(fmtItem);
            return `   • ${e.title} (${fmtDate(e.performedAt as Date | null)})` + (itens.length ? '\n      ' + itens.join('\n      ') : ' — sem alterações');
          })
          .join('\n')
      : '(nenhum exame extraído ainda)';

    // CRUZAMENTO: mesmos analitos ao longo do tempo → a IA usa pra evolução/comparação/tendência.
    // DEDUP por (analito + dia): 2 exames no mesmo dia (reenvio / painel sobreposto) não viram
    // 2 pontos — recent[] vem em performedAt desc, então o 1º a aparecer é o mais recente.
    const byAnalyte = new Map<string, { name: string; pts: string[] }>();
    const trendSeen = new Set<string>();
    for (const e of recent) {
      const dt = fmtDate(e.performedAt as Date | null);
      for (const it of (e.items as any[])) {
        const k = it.nameCanonical || it.name;
        if (!trendSeen.has(`${k}|${dt}`)) {
          trendSeen.add(`${k}|${dt}`);
          const entry = byAnalyte.get(k) ?? { name: it.name, pts: [] as string[] };
          entry.pts.push(`${fmtVal(it)}${it.unit ? ' ' + it.unit : ''} (${dt})`);
          byAnalyte.set(k, entry);
        }
      }
    }
    const trendBlock = [...byAnalyte.values()].map((v) => `   • ${v.name}: ${v.pts.join('  →  ')}`).join('\n');

    const contextText =
      `CONTEXTO DO PACIENTE (use estes dados REAIS pra responder com precisão):\n` +
      `- Paciente: ${patient?.fullName ?? '—'}\n` +
      (patient?.clinicalProfile ? `- Perfil clínico: ${patient.clinicalProfile}\n` : '') +
      `- Exames recentes (TODOS os itens — nome: valor (ref) [flag se alterado]):\n${examsBlock}\n` +
      (trendBlock ? `\n- Analitos alterados ao longo do tempo (use pra evolução/comparar/tendência):\n${trendBlock}\n` : '') +
      (memory ? `- Resumo de análises anteriores (mantenha coerência):\n${memory}\n` : '') +
      `\nDIRETIVA: responda DIRETAMENTE à pergunta USANDO os dados acima. Extraia e CRUZE os itens ` +
      `específicos pedidos — "valores fora da faixa" → liste cada um com valor+ref+flag; "evolução/comparar/ ` +
      `tendência" → use a linha do tempo por analito; "atenção/urgência" → aponte os alterados relevantes. ` +
      `NÃO despeje a lista inteira de exames se a pergunta for específica — responda ao que foi perguntado com ` +
      `os dados certos. Conteúdo educativo; oriente sempre o médico.`;

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
    await chargeCredits(req.userId!, CREDIT_COSTS.chat, 'ai_chat', 'Chat com a IA');
    // Persiste a conversa em .md (não se perde; vira memória durável do paciente)
    appendConversation(slug, message, text);
  } catch (e) {
    if (!res.headersSent) next(e);
    else console.error('[chat.global] erro no stream:', e);
  }
});

export default router;
