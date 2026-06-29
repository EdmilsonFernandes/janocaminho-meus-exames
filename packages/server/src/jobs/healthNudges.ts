import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';
import { sendNudgeEmail } from '../utils/nudgeMail';
import { getAnthropic, MODEL } from '../claude/client';

/** Scheduler de NUDGES de saúde (engajamento DIÁRIO garantido às 08h BRT).
 *  - Dispara 1x/dia às 08h BRT (= 11h UTC — Brasil sem DST desde 2019, UTC-3 fixo o ano todo).
 *    Agendamento por setTimeout ao próximo 11h UTC: preciso e independente do TZ do container
 *    (antes usava setInterval 1h + janela 8-11h em hora LOCAL → no container UTC virava 5-8h BRT).
 *  - TODO usuário com ≥1 exame extraído recebe UM nudge/dia:
 *    🔴 valor alterado em exame recente (30d) e sem alerta nos últimos 3 dias → ALERTA
 *       (pega um alterado ALEATÓRIO entre os recentes, pra variar a mensagem);
 *    caso contrário → 💡 DICA de saúde gerada pela IA (Dr. Exame): 1 dica/dia cacheada e
 *       reusada pra todos os usuários daquela manhã (1 chamada GLM/dia, fallback curado se falhar).
 *  - Anti-spam: alerta no máx. 1x a cada 3 dias por usuário (a dica pode virar todo dia).
 *  - Cria Notification (central) + envia push (Firebase Admin). E-mail só cai pra ALERTA (não spamma dica diária). */
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias (só p/ alerta)
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;  // 30 dias
// 08h BRT = 11h UTC (Brasil sem horário de verão desde 2019 → UTC-3 o ano inteiro).
const NUDGE_UTC_HOUR = 11;

/** Milissegundos até o próximo instante em que a hora UTC == targetHour (00h00min). */
function msUntilNextUtcHour(targetHour: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1); // já passou hoje → amanhã
  return next.getTime() - now.getTime();
}

// Dicas curadas (fallback se o GLM falhar ou a chave não estiver configurada). Voz do Dr. Exame.
const FALLBACK_TIPS = [
  'Beba um copo d’água agora — boa hidratação ajuda rins, pele e disposição.',
  'Caminhe 10 minutos hoje. Pequenas caminhadas melhoram pressão, açúcar e humor.',
  'Durma 7 a 8 horas: o sono regula hormônios, imunidade e memória. Evite telas 1h antes.',
  'Capriche no prato colorido — frutas, verduras e fibras ajudam intestino e coração.',
  'Mediu sua pressão últimamente? Anote os valores pra acompanhar a tendência.',
  'Reserve 2 minutos pra respirar fundo — reduz estresse e pressão arterial.',
  'Exames de rotina em dia? Previnir é mais fácil que remediar.',
  '15 min de sol de manhã ajudam na vitamina D e no ritmo do sono.',
  'Reduza ultraprocessados e açúcar: glicose e colesterol agradecem.',
  'Pese-se sempre no mesmo dia e horário — a tendência vale mais que o número isolado.',
];
// Cache da dica do dia (1 chamada GLM/dia, reusada pra todos os usuários daquela manhã).
let cachedTip: { day: string; text: string } | null = null;

/** Dica de saúde do dia: gerada pela IA (Dr. Exame), cacheada por dia. Fallback curado se o GLM falhar. */
async function getDailyHealthTip(): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  if (cachedTip && cachedTip.day === day) return cachedTip.text;
  try {
    const client = getAnthropic();
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: 'Você é o Dr. Exame, assistente de saúde empático e prático do app Meus Exames. Gere UMA dica de saúde curta (máx 2 frases, ~180 caracteres), acionável e variada (hidratação, sono, movimento, alimentação, prevenção, exames de rotina, saúde mental, pressão/glicose). Sem jargão médico, sem diagnóstico. Responda APENAS com a dica, sem aspas nem prefixo.',
      messages: [{ role: 'user', content: 'Dê a dica de saúde de hoje para o usuário.' }],
    } as any);
    const text = ((r as any).content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (text) { cachedTip = { day, text }; return text; }
  } catch (e) {
    console.warn('[nudges] GLM tip falhou, usando dica curada:', (e as Error).message);
  }
  const fb = FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
  cachedTip = { day, text: fb };
  return fb;
}

export function startHealthNudgeJob(): void {
  const run = async () => {
    try {
      console.log(`[nudges] tick diário 08h BRT @ ${new Date().toISOString()}`);
      const users = await prisma.user.findMany({
        where: { patients: { some: { exams: { some: { status: 'EXTRACTED' } } } } }, // tem ≥1 exame extraído
        select: { id: true, name: true, email: true, nudgeEmails: true, emailVerified: true },
        take: 200,
      });
      console.log(`[nudges] ${users.length} usuário(s) com exames (cada um recebe alerta ou dica da IA)`);
      for (const u of users) {
        await maybeNudge(u.id, u.name, u.email, u.nudgeEmails, u.emailVerified).catch((e) => console.error('[nudges] erro usuário', u.id, (e as Error).message));
      }
      console.log('[nudges] tick concluído');
    } catch (e) {
      console.error('[nudges] job error:', (e as Error).message);
    }
    scheduleNext();
  };
  const scheduleNext = () => {
    const ms = msUntilNextUtcHour(NUDGE_UTC_HOUR);
    console.log(`[nudges] próximo disparo 08h BRT em ${Math.round(ms / 60000)} min (@ ${new Date(Date.now() + ms).toISOString()})`);
    setTimeout(run, ms);
  };
  console.log('[nudges] job de nudges iniciado (diário 08h BRT = 11h UTC; alerta aleatório ou dica da IA)');
  scheduleNext();
}

async function maybeNudge(userId: string, userName: string, email: string, nudgeEmails: boolean, emailVerified: boolean): Promise<void> {
  const first = (userName || '').split(' ')[0];
  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const since = new Date(Date.now() - RECENT_MS);
  let type = '', title = '', body = '', data: Record<string, string> = {};

  // 1) ALERTA: valor alterado em exame recente E sem alerta nos últimos 3 dias (anti-spam de alerta).
  //    Pega um alterado ALEATÓRIO entre os recentes pra variar a mensagem a cada dia.
  const recentAlert = await prisma.notification.findFirst({ where: { userId, type: 'alert', createdAt: { gte: cutoff } }, select: { id: true } });
  if (!recentAlert) {
    const abnormals = await prisma.examItem.findMany({
      where: { isAbnormal: true, exam: { patient: { ownerId: userId }, OR: [{ performedAt: { gte: since } }, { performedAt: null, createdAt: { gte: since } }] } },
      orderBy: { exam: { performedAt: 'desc' } },
      take: 15,
      select: { name: true, nameCanonical: true, exam: { select: { id: true } } },
    });
    if (abnormals.length) {
      const a = abnormals[Math.floor(Math.random() * abnormals.length)];
      type = 'alert';
      title = `${first}, um valor precisa de atenção`;
      body = `Seu ${a.name} está fora da faixa em exame recente. Vale conversar com seu médico pra avaliar.`;
      data = { examId: a.exam?.id ?? '', nameCanonical: a.nameCanonical ?? a.name };
    }
  }

  // 2) Sem alerta hoje → DICA de saúde da IA (engajamento diário garantido).
  if (!type) {
    type = 'tip';
    title = `💡 Dica do Dr. Exame pra ${first}`;
    body = await getDailyHealthTip();
  }

  // sendPushToUser JÁ salva a notificação in-app (central do app) E envia o push —
  // antes havia um prisma.notification.create duplicado aqui (= 2 notificações por nudge).
  await sendPushToUser(userId, title, body, { type, ...(data.examId ? { examId: data.examId } : {}) });
  // FALLBACK por e-mail: SÓ pra ALERTA e só pra quem NÃO tem push (iPhone no navegador etc.).
  // A dica diária NÃO vai por e-mail (evita spam). Best-effort (sendNudgeEmail loga e não propaga).
  if (type === 'alert') {
    const tokenCount = await prisma.deviceToken.count({ where: { userId } }).catch(() => 1); // em erro, assume "tem push"
    if (!tokenCount && nudgeEmails && emailVerified) {
      await sendNudgeEmail({ to: email, userId, firstName: first, title, body, examId: data.examId || undefined });
      console.log(`[nudges] e-mail (sem push) p/ ${userName}: ${title}`);
    }
  }
  console.log(`[nudges] enviado p/ ${userName} [${type}]: ${title}`);
}
