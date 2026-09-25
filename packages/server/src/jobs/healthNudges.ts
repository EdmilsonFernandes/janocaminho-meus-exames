import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';
import { sendNudgeEmail } from '../utils/nudgeMail';
import { getLlm, getModel } from '../llm';
import { getCachedHealthSummary } from '../analysis/hs-cache';
import { buildTipPrompt, curatedFallback, pickTipTheme, classifySegment, type TipContext, type TipMarker, type TipTheme } from './tipEngine';

/** Scheduler de NUDGES de saúde (08h BRT).
 *  - ALERTA: valor alterado em exame recente (30d) DESTE paciente, sem alerta nos últimos 3 dias.
 *    Pode vir qualquer dia — é informação relevante. Anti-spam: máx 1x/3d por paciente.
 *  - DICA INTELIGENTE (25/09/26 — antes era por "segmento", todo mundo do segmento recebia o
 *    mesmo texto): SÓ 2x/semana (terça e sexta), gerada POR PACIENTE com os dados DELE —
 *    marcadores com valores/tendência (health-summary), atividade da semana (Health Connect),
 *    medicações ativas, tempo desde o último exame. ROTAÇÃO de tema com memória (as 2 últimas
 *    dicas do paciente não repetem o tema — notification.data.theme) e o GLM recebe as dicas
 *    anteriores pra não repetir o ângulo. Fallback curado por TEMA já preenchido com os dados.
 *  - Cria Notification (central) + push (Firebase). E-mail só cai pro ALERTA e só pra quem não tem push.
 *
 *  Histórico: a "dica genérica às 08h" vinha daqui (FALLBACK rotativo c/ "beba água" + IA global).
 *  dfa91a7 corrigiu a dica do DASHBOARD (web), não a do push — por isso o "beba água" voltava.
 *  set/26: dica por segmento (1 GLM/dia p/ todo o segmento) ainda parecia repetitiva — este rework. */
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias (só p/ alerta)
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;  // 30 dias
const NUDGE_UTC_HOUR = 11; // 08h BRT = 11h UTC (Brasil sem DST desde 2019 → UTC-3 o ano todo)
// Dias de DICA (sem alerta): terça(2) e sexta(5). Alerta pode vir qualquer dia.
const TIP_DAYS = new Set([2, 5]);

/** Milissegundos até o próximo instante em que a hora UTC == targetHour (00h00min). */
function msUntilNextUtcHour(targetHour: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1); // já passou hoje → amanhã
  return next.getTime() - now.getTime();
}

// Cache de dica por dia+paciente (retry no mesmo dia não regenera nem queima token de novo).
const tipCache = new Map<string, string>();

/** Dica via GLM POR PACIENTE (contexto real + últimas dicas p/ não repetir). Fallback curado do tema. */
async function generateTip(patientId: string, ctx: TipContext, theme: TipTheme, recentBodies: string[]): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${patientId}`;
  const cached = tipCache.get(key);
  if (cached) return cached;
  const { system, user } = buildTipPrompt(ctx, theme, recentBodies);
  try {
    const r = await getLlm().complete({ model: getModel(), maxTokens: 220, system, messages: [{ role: 'user', content: user }] });
    let text = (r.text || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
    if (text.length > 280) text = text.slice(0, 277).trimEnd() + '…';
    if (text) { tipCache.set(key, text); return text; }
  } catch (e) {
    console.warn('[nudges] GLM tip falhou, usando fallback do tema:', (e as Error).message);
  }
  const fb = curatedFallback(ctx, theme);
  tipCache.set(key, fb);
  return fb;
}

/** Monta o contexto REAL do paciente p/ a dica: health-summary + atividade HC + medicação + dicas recentes.
 *  (exportada p/ smoke test manual: `npx tsx scripts/smoke-tip.ts`) */
export async function buildSmartTip(patientId: string, ownerId: string, firstName: string): Promise<{ body: string; theme: TipTheme } | null> {
  const [hs, lastExam, meds, recentTips, acts] = await Promise.all([
    getCachedHealthSummary(patientId).catch(() => null),
    prisma.exam.findFirst({ where: { patientId, status: 'EXTRACTED', performedAt: { not: null } }, orderBy: { performedAt: 'desc' }, select: { performedAt: true } }),
    prisma.medication.findMany({ where: { patientId, active: true }, select: { name: true }, take: 4 }),
    prisma.notification.findMany({ where: { userId: ownerId, type: 'tip', data: { path: ['patientId'], equals: patientId } }, orderBy: { createdAt: 'desc' }, take: 5, select: { body: true, data: true } }),
    prisma.measurement.findMany({ where: { patientId, type: { in: ['STEPS', 'EXERCISE_MINUTES', 'HEART_RATE'] }, note: 'Health Connect', measuredAt: { gte: new Date(Date.now() - 14 * 86400000) } }, select: { type: true, value: true, measuredAt: true }, orderBy: { measuredAt: 'desc' } }),
  ]);

  const mk = (m: any): TipMarker => ({
    name: m?.name ?? '', value: m?.latest?.valueNumeric ?? null, prev: m?.prior?.valueNumeric ?? null,
    unit: m?.unit ?? null, deltaPct: m?.deltaPct ?? null, flag: m?.flag ?? '', refHigh: m?.refHigh ?? null,
  });
  const improving: TipMarker[] = (Array.isArray(hs?.improving) ? (hs.improving as any[]).slice(0, 3) : []).map((m: any) => mk(m)).filter((m) => m.name);
  const worsening: TipMarker[] = (Array.isArray(hs?.worsening) ? (hs.worsening as any[]).slice(0, 3) : []).map((m: any) => mk(m)).filter((m) => m.name);

  // Atividade: só considera quem sincroniza (acts.length > 0) — sem dado ≠ sedentário.
  const now = Date.now();
  let minWeek = 0, minPrev = 0, steps = 0, stepDays = 0, restingHr: number | null = null;
  for (const a of acts) {
    const ageD = (now - a.measuredAt.getTime()) / 86400000;
    if (a.type === 'EXERCISE_MINUTES') { if (ageD < 7) minWeek += a.value; else minPrev += a.value; }
    else if (a.type === 'STEPS' && ageD < 7) { steps += a.value; stepDays++; }
    else if (a.type === 'HEART_RATE' && restingHr == null) restingHr = a.value; // mais recente
  }

  const cardio = hs?.cardiometabolicRisk;
  const ctx: TipContext = {
    firstName,
    score: typeof hs?.score === 'number' ? hs.score : null,
    daysSinceExam: lastExam?.performedAt ? Math.floor((now - lastExam.performedAt.getTime()) / 86400000) : null,
    stale: !!hs?.staleWarning,
    improving, worsening,
    cardioLevel: typeof cardio?.level === 'string' ? cardio.level : '',
    cardioFactors: Array.isArray(cardio?.factors) ? cardio.factors.filter((f: any) => f?.risk).length : 0,
    activeMinutesWeek: acts.length ? minWeek : null,
    activeMinutesPrevWeek: acts.length ? minPrev : null,
    stepsAvgDay: stepDays ? Math.round(steps / stepDays) : null,
    restingHr,
    medications: meds.map((m) => m.name),
    segment: classifySegment(`${worsening[0]?.name ?? ''} ${improving[0]?.name ?? ''} ${hs?.clinicalSummary ?? ''}`),
  };

  const recentThemes = recentTips.map((n) => (n.data as any)?.theme).filter(Boolean) as string[];
  const recentBodies = recentTips.map((n) => n.body).filter(Boolean);
  const theme = pickTipTheme(ctx, recentThemes);
  const body = await generateTip(patientId, ctx, theme, recentBodies);
  return { body, theme };
}

export function startHealthNudgeJob(): void {
  const run = async () => {
    try {
      console.log(`[nudges] tick diário 08h BRT @ ${new Date().toISOString()}`);
      // Por-PACIENTE (não por user): cada dependente recebe SEU nudge com SEU nome + SEUS dados.
      const patients = await prisma.patient.findMany({
        where: { exams: { some: { status: 'EXTRACTED' } } },
        include: { owner: { select: { id: true, email: true, nudgeEmails: true, emailVerified: true } } },
        take: 500,
      });
      console.log(`[nudges] ${patients.length} paciente(s) com exames (1 nudge por dependente, nome/dados dele)`);
      for (const p of patients) {
        await maybeNudgeForPatient(p).catch((e) => console.error('[nudges] erro paciente', p.id, (e as Error).message));
        // Pacing: dica agora é 1 GLM POR paciente — 150ms entre pacientes poupa o relay.
        await new Promise((r) => setTimeout(r, 150));
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
  console.log('[nudges] job de nudges iniciado (diário 08h BRT; alerta real qualquer dia + dica personalizada ter/sex)');
  scheduleNext();
}

async function maybeNudgeForPatient(patient: { id: string; fullName: string; owner: { id: string; email: string; nudgeEmails: boolean; emailVerified: boolean } }): Promise<void> {
  const owner = patient.owner;
  const first = (patient.fullName || '').split(' ')[0]; // nome do PACIENTE (dependente), não do titular
  const cutoff = new Date(Date.now() - COOLDOWN_MS);
  const since = new Date(Date.now() - RECENT_MS);
  let type = '', title = '', body = '';
  const data: Record<string, string> = { patientId: patient.id };

  // 1) ALERTA: valor alterado em exame recente DESTE paciente, sem alerta nos últimos 3 dias
  //    para este paciente (anti-spam por dependente).
  const recentAlert = await prisma.notification.findFirst({ where: { userId: owner.id, type: 'alert', createdAt: { gte: cutoff }, data: { path: ['patientId'], equals: patient.id } }, select: { id: true } });
  if (!recentAlert) {
    const abnormals = await prisma.examItem.findMany({
      where: { isAbnormal: true, exam: { patientId: patient.id, OR: [{ performedAt: { gte: since } }, { performedAt: null, createdAt: { gte: since } }] } },
      orderBy: { exam: { performedAt: 'desc' } },
      take: 15,
      select: { name: true, nameCanonical: true, exam: { select: { id: true } } },
    });
    if (abnormals.length) {
      const a = abnormals[Math.floor(Math.random() * abnormals.length)];
      type = 'alert';
      title = `${first}, um valor precisa de atenção`;
      body = `Seu ${a.name} está fora da faixa em exame recente. Vale conversar com seu médico pra avaliar.`;
      data.examId = a.exam?.id ?? '';
      data.nameCanonical = a.nameCanonical ?? a.name;
    }
  }

  // 2) Sem alerta hoje → DICA INTELIGENTE por paciente, SÓ 2x/semana (ter/sex).
  //    Nos outros dias, não incomoda. Tema gira com memória (nunca 2 dicas seguidas iguais).
  if (!type) {
    const dow = new Date().getUTCDay();
    if (!TIP_DAYS.has(dow)) return; // hoje não é dia de dica → silencioso
    const tip = await buildSmartTip(patient.id, owner.id, first);
    if (!tip) return;
    type = 'tip';
    title = `💡 Dica do Dr. Exame pra ${first}`;
    body = tip.body;
    data.theme = tip.theme; // memória da rotação (notification.data.theme)
  }

  // sendPushToUser salva a notificação in-app (central) E envia o push pro OWNER (dono da conta).
  await sendPushToUser(owner.id, title, body, { type, ...data });
  // FALLBACK por e-mail: SÓ pra ALERTA e só pra quem NÃO tem push (iPhone no navegador etc.).
  if (type === 'alert') {
    const tokenCount = await prisma.deviceToken.count({ where: { userId: owner.id } }).catch(() => 1);
    if (!tokenCount && owner.nudgeEmails && owner.emailVerified) {
      await sendNudgeEmail({ to: owner.email, userId: owner.id, firstName: first, title, body, examId: data.examId || undefined });
      console.log(`[nudges] e-mail (sem push) p/ ${patient.fullName}: ${title}`);
    }
  }
  console.log(`[nudges] enviado p/ ${patient.fullName} (owner ${owner.id}) [${type}]: ${title}`);
}
