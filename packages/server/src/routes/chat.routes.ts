import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthedRequest, userPatientIds } from '../middleware/auth';
import { streamChat } from '../analysis/chat';
import { memoryDigest, patientSlug, appendConversation } from '../analysis/agent-memory';
import { chargeCredits, refundCredits, CREDIT_COSTS } from '../utils/credits';
import { tryLocalAnswer, streamLocalAnswer } from '../analysis/chat-router';
import { describeStaleness } from '../analysis/health-state';
import { guidelinesContext } from '../analysis/guidelines';
import { guidelinesEnabled } from '../utils/settings';
import { personalizedTargets, formatTarget } from '../analysis/personalized-targets';

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
      select: { userMessage: true, contentMd: true, structured: true },
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
      // senão responde "você não tem esse exame".
      // SEM take + orderBy por painel: antes era `take:30, orderBy name asc` — TSH (começa com T)
      // era CORTADO do exame mais recente em painéis grandes → a IA citava o valor ANTIGO (bug do TSH 11 vs 7).
      include: { items: { orderBy: [{ panel: 'asc' }, { name: 'asc' }] } },
    });

    // RAG: memória do agente (análises anteriores do paciente)
    const slug = patientSlug(patient?.fullName ?? 'paciente', pid);
    const memory = memoryDigest(slug, 3);

    // ATIVIDADE FÍSICA (Health Connect) — a IA enxerga passos/calorias/FC/distância do
    // paciente e responde perguntas de rotina/atividade/peso com DADOS reais (pedido do
    // dono 28/09: "ela não considera quando a pessoa tem Health Connect conectado").
    // Sem sincronização ≠ sedentário: o bloco só entra se existirem medições HC.
    const hcActs = await prisma.measurement.findMany({
      where: {
        patientId: pid, note: 'Health Connect',
        type: { in: ['STEPS', 'CALORIES', 'DISTANCE', 'HEART_RATE', 'EXERCISE_MINUTES'] },
        measuredAt: { gte: new Date(Date.now() - 14 * 86400000) },
      },
      select: { type: true, value: true, measuredAt: true },
      orderBy: { measuredAt: 'desc' },
      take: 400,
    });
    const days7 = new Set(hcActs.filter((a) => Date.now() - a.measuredAt.getTime() < 7 * 86400000).map((a) => a.measuredAt.toISOString().slice(0, 10)));
    const sumType = (t: string) => hcActs.filter((a) => a.type === t && Date.now() - a.measuredAt.getTime() < 7 * 86400000).reduce((s, a) => s + a.value, 0);
    const avgDay = (t: string) => Math.round(sumType(t) / Math.max(1, days7.size));
    const activityLines: string[] = [];
    if (hcActs.some((a) => a.type === 'STEPS')) activityLines.push(`   • Passos: média de ${avgDay('STEPS').toLocaleString('pt-BR')}/dia nos últimos 7 dias`);
    if (hcActs.some((a) => a.type === 'EXERCISE_MINUTES')) activityLines.push(`   • Minutos de atividade: ${Math.round(sumType('EXERCISE_MINUTES'))} acumulados em 7 dias (OMS recomenda 150/sem)`);
    if (hcActs.some((a) => a.type === 'CALORIES')) activityLines.push(`   • Calorias: média de ${avgDay('CALORIES').toLocaleString('pt-BR')} kcal/dia`);
    if (hcActs.some((a) => a.type === 'DISTANCE')) activityLines.push(`   • Distância: ${(sumType('DISTANCE')).toFixed(1).replace('.', ',')} km em 7 dias`);
    const lastHr = hcActs.find((a) => a.type === 'HEART_RATE');
    if (lastHr) activityLines.push(`   • Frequência cardíaca de repouso mais recente: ${Math.round(lastHr.value)} bpm`);
    const activityBlock = activityLines.length
      ? `- ATIVIDADE FÍSICA (Health Connect do celular, últimos 7 dias — use quando a pergunta envolver rotina, atividade, peso, sono ou condicionamento; nunca invente números):\n${activityLines.join('\n')}\n`
      : '';

    // F1 — ALVOS PERSONALIZADOS por medicação/condição (levotiroxina→TSH 0,4–2,5;
    // diabetes→LDL<100 e HbA1c<7 — regras fechadas com citação real). A IA passa a
    // interpretar estes analitos contra o alvo do TRATAMENTO do paciente, citando o
    // motivo. Leitura COMPLEMENTAR: nunca substituem a faixa do laboratório do laudo.
    const activeMeds = await prisma.medication.findMany({
      where: { patientId: pid, active: true },
      select: { name: true, activeIngredient: true },
    });
    const pTargets = personalizedTargets(
      recent.flatMap((e) =>
        (e.items as any[]).map((it: any) => ({
          nameCanonical: String(it.nameCanonical ?? it.name ?? ''),
          valueNumeric: it.valueNumeric ?? null,
        })),
      ),
      {
        medications: activeMeds.flatMap((m) => [m.name, m.activeIngredient]).filter((x): x is string => !!x),
        conditions: patient?.clinicalProfile ?? '',
      },
    );
    const targetsBlock = pTargets.length
      ? `- ALVOS PERSONALIZADOS pelo seu tratamento (use ao interpretar estes analitos; cite o motivo e a fonte entre colchetes; são COMPLEMENTO — a faixa de referência do laudo continua válida para leitura do item):\n${pTargets
          .map((t) => `   • ${t.analyte}: alvo ${formatTarget(t)}${t.unit ? ' ' + t.unit : ''} (${t.appliesTo}) [${t.citation}]`)
          .join('\n')}\n`
      : '';

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

    // VALORES ATUAIS — o MAIS RECENTE por analito (anti-alucinação). Antes a IA citava o valor ANTIGO
    // como "atual" (bug TSH 11 vs 7) porque o take:30 cortava o item do exame recente. Agora recent[]
    // vem em performedAt desc → o 1º a aparecer de cada analito É o mais recente. Reforçado pela DIRETIVA.
    const currentSeen = new Set<string>();
    const currentBlock: string[] = [];
    for (const e of recent) {
      const dt = fmtDate(e.performedAt as Date | null);
      const st = describeStaleness(e.performedAt as Date | null);
      // Rótulo temporal no "quando": exame velho fica marcado p/ a IA não tratar como estado atual.
      const when = `exame de ${dt}${st.isOld && st.label ? ` (${st.label}, valor histórico)` : st.isStale && st.label ? ` (${st.label}, pode estar desatualizado)` : ''}`;
      for (const it of (e.items as any[])) {
        const k = it.nameCanonical || it.name;
        if (currentSeen.has(k)) continue;
        currentSeen.add(k);
        currentBlock.push(`   • ${it.name}: ${fmtVal(it)}${it.unit ? ' ' + it.unit : ''}${fmtRef(it) ? ` (ref ${fmtRef(it)})` : ''}${fmtFlag(it) ? ` [${fmtFlag(it)}]` : ''} — ${when}`);
      }
    }

    const contextText =
      `CONTEXTO DO PACIENTE (use estes dados REAIS pra responder com precisão):\n` +
      `- Paciente: ${patient?.fullName ?? '—'}\n` +
      (patient?.clinicalProfile ? `- Perfil clínico: ${patient.clinicalProfile}\n` : '') +
      activityBlock +
      targetsBlock +
      (currentBlock.length ? `- VALORES ATUAIS (exame MAIS RECENTE por analito — use ESTES ao citar "atual/último resultado"):\n${currentBlock.join('\n')}\n` : '') +
      `- Exames recentes (TODOS os itens — nome: valor (ref) [flag se alterado]):\n${examsBlock}\n` +
      (trendBlock ? `\n- Analitos ao longo do tempo (use pra evolução/comparar/tendência; o 1º valor de cada linha é o MAIS RECENTE):\n${trendBlock}\n` : '') +
      (memory ? `- Resumo de análises anteriores (mantenha coerência):\n${memory}\n` : '') +
      `\nDIRETIVA: responda DIRETAMENTE à pergunta USANDO os dados acima. Se o usuário CITAR um valor específico na ` +
      `pergunta (ex.: "minha glicose deu 108"), responda sobre ESSE valor: localize-o nos exames (data + flag) e, se NÃO ` +
      `for o mais recente, compare explicitamente com o mais recente — NUNCA tranquilize com um valor diferente do que foi ` +
      `perguntado. Ao citar um valor como "atual/último", ` +
      `use SEMPRE o do exame MAIS RECENTE (maior data) daquele analito — está em "VALORES ATUAIS". Extraia e CRUZE os itens ` +
      `específicos pedidos — "valores fora da faixa" → liste cada um com valor+ref+flag; "evolução/comparar/ ` +
      `tendência" → use a linha do tempo por analito; "atenção/urgência" → aponte os alterados relevantes. ` +
      `NÃO despeje a lista inteira de exames se a pergunta for específica — responda ao que foi perguntado com ` +
      `os dados certos. Valores de exames ANTIGOS (rotulados "histórico"/"desatualizado") NÃO representam o estado ` +
      `atual — diga que pode estar desatualizado e oriente a refazer o exame. Conteúdo educativo; oriente sempre o médico.`;

    // FEATURE C — diretrizes de sociedades médicas com citação: casa os analitos reais da
    // conversa (nameCanonical dos itens, mesma chave do normalize.ts) + a pergunta contra os
    // cards de knowledge/guidelines/*.md e injeta os pontos-chave com a instrução de citar
    // [FONTE ANO]. Kill-switch: AppSetting guidelines.enabled=0 → block null, nada muda.
    const { block: guidelinesTxt, topics: guidelineTopics } = guidelinesContext(
      recent.flatMap((e) => (e.items as any[]).map((it) => it.nameCanonical)),
      message,
      guidelinesEnabled(),
    );
    const fullContext = guidelinesTxt ? `${contextText}\n${guidelinesTxt}` : contextText;

    // DÉBITO ATÔMICO ANTES da chamada de IA (anti-race). Antes era gate-read + charge DEPOIS do
    // stream: N requisições paralelas passavam no gate com o mesmo saldo → N respostas de IA, 1 débito.
    // Agora: chargeCredits (atômico, só debita se credits>=cost) ANTES; se falhar → 402 sem chamar IA.
    // Se a IA falhar depois do débito → reembolso (refundCredits).
    const charged = await chargeCredits(req.userId!, CREDIT_COSTS.chat, 'ai_chat', 'Chat com a IA');
    if (!charged) {
      res.status(402).json({ error: 'insufficient_credits', message: 'Sem créditos para conversar. Compre um pacote de créditos.' });
      return;
    }
    let text: string; let model: string; let sources: { label: string; topic: string }[];
    try {
      ({ text, model, sources } = await streamChat({ res, contextText: fullContext, history, message, guidelineTopics }));
    } catch (e) {
      await refundCredits(req.userId!, CREDIT_COSTS.chat, 'ai_chat_refund', 'Reembolso: falha na IA (chat)');
      throw e;
    }
    await prisma.aiAnalysis.create({
      data: { type: 'CHAT', patientId: pid, userMessage: message, contentMd: text, modelUsed: model, structured: { sources: sources ?? [] } as any },
    });
    // Persiste a conversa em .md (não se perde; vira memória durável do paciente)
    appendConversation(slug, message, text);
  } catch (e) {
    if (!res.headersSent) next(e);
    else console.error('[chat.global] erro no stream:', e);
  }
});

export default router;
