import { prisma } from '../prisma';
import { sendPushToUser } from '../utils/push';
import { sendNudgeEmail } from '../utils/nudgeMail';
import { getLlm, getModel } from '../llm';

/** Scheduler de NUDGES de saúde (08h BRT).
 *  - ALERTA: valor alterado em exame recente (30d) DESTE paciente, sem alerta nos últimos 3 dias.
 *    Pode vir qualquer dia — é informação relevante. Anti-spam: máx 1x/3d por paciente.
 *  - DICA: PERSONALIZADA ao perfil/exames do paciente (por segmento), SÓ 2x/semana (terça e sexta).
 *    Nunca mais dica genérica "beba água" todo dia — a dica agora fala do foco real do paciente
 *    (colesterol, glicemia, pressão, anemia, tireoide, renal) ou prevenção de rotina.
 *  - Cria Notification (central) + push (Firebase). E-mail só cai pro ALERTA e só pra quem não tem push.
 *
 *  Histórico: a "dica genérica às 08h" vinha daqui (FALLBACK rotativo c/ "beba água" + IA global).
 *  dfa91a7 corrigiu a dica do DASHBOARD (web), não a do push — por isso o "beba água" voltava. */
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

// Segmento de saúde do paciente — chaveia a dica personalizada (1 segmento por paciente/dia).
type Segment = 'colesterol' | 'glicemia' | 'pressao' | 'anemia' | 'tireoide' | 'renal' | 'rotina';
const SEGMENT_RULES: { seg: Segment; test: RegExp }[] = [
  { seg: 'colesterol', test: /(ldl|colesterol|triglicer|hdl|lipid)/i },
  { seg: 'glicemia', test: /(glicemia|glicose|hemoglobina glic|hba1c|insulina|homair|glicada)/i },
  { seg: 'pressao', test: /(pressao|pa\b|arterial|sistol|diastol|has\b)/i },
  { seg: 'tireoide', test: /(tsh|t4\b|t4livre|tiro|levotiroxina)/i },
  { seg: 'anemia', test: /(hemoglobin|hematocrito|ferro|ferritina|eritro|vcm|hcm)/i },
  { seg: 'renal', test: /(creatinina|ureia|egfr|renal|microalbumin|tfg)/i },
];

/** Classifica o segmento do paciente a partir do histórico (itens alterados + perfil clínico livre). */
function classifySegment(text: string): Segment {
  for (const r of SEGMENT_RULES) if (r.test.test(text)) return r.seg;
  return 'rotina';
}

// Fallback curado POR SEGMENTO — relevante ao foco do paciente, SEM "beba água"/genéricas chatas.
const FALLBACK_BY_SEGMENT: Record<Segment, string> = {
  colesterol: 'Seu colesterol já esteve alterado: corte gordura saturada (carnes vermelhas, frituras) e capriche na fibra — aveia e feijão ajudam o LDL a cair.',
  glicemia: 'Sua glicose merece atenção: evite açúcar em jejum, prefira integrais e caminhe 15 min após as refeições — o músculo consome a glicose.',
  pressao: 'Já teve pressão alta? Reduza o sal e embutidos, e meça a PA sempre no mesmo braço e horário. Anote pra ver a tendência.',
  anemia: 'Seus hematimetos já variaram: capriche em ferro (carne, feijão, folhas escuras) com vitamina C (laranja) pra absorver melhor.',
  tireoide: 'Você tem medicação de tireoide: tome em jejum, longe de cálcio/ferro, e revise a TSH na frequência que o médico pediu.',
  renal: 'Sua função renal pede cuidado: hidrate-se bem, evite excesso de anti-inflamatórios e de proteína animal.',
  rotina: 'Previnir é mais fácil que remediar: mantenha os exames de rotina em dia e leve cada dúvida ao seu médico.',
};

// Cache de dica por dia+segmento (no máx ~7 chamadas GLM/dia, uma por segmento — não uma por paciente).
const tipCache = new Map<string, string>();

/** Dica personalizada ao segmento, gerada pela IA (cacheada por dia+segmento). Fallback curado se o GLM falhar. */
async function getTipForSegment(seg: Segment): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${seg}`;
  const cached = tipCache.get(key);
  if (cached) return cached;
  try {
    const r = await getLlm().complete({
      model: getModel(),
      maxTokens: 200,
      system: 'Você é o Dr. Exame, assistente de saúde empático e prático do app Meus Exames. Gere UMA dica de saúde curta (máx 2 frases, ~180 caracteres), acionável e ESPECÍFICA para o foco informado. Sem jargão médico, sem diagnóstico. PROIBIDO gerar dicas genéricas/óbvias como "beba água", "coma frutas", "durma bem" — seja específico do foco. Responda APENAS com a dica, sem aspas nem prefixo.',
      messages: [{ role: 'user', content: `Foco de saúde do usuário: ${seg}. Dê uma dica prática e específica para este foco.` }],
    });
    const text = (r.text || '').trim();
    if (text) { tipCache.set(key, text); return text; }
  } catch (e) {
    console.warn('[nudges] GLM tip falhou, usando fallback de segmento:', (e as Error).message);
  }
  const fb = FALLBACK_BY_SEGMENT[seg];
  tipCache.set(key, fb);
  return fb;
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

  // 2) Sem alerta hoje → DICA personalizada ao perfil/exames, SÓ 2x/semana (ter/sex).
  //    Nos outros dias, não incomoda (sem dica genérica diária).
  if (!type) {
    const dow = new Date().getUTCDay();
    if (!TIP_DAYS.has(dow)) return; // hoje não é dia de dica → silencioso
    // Classifica o segmento pelo histórico do paciente (último alterado + perfil clínico livre).
    const [lastAbn, prof] = await Promise.all([
      prisma.examItem.findFirst({ where: { isAbnormal: true, exam: { patientId: patient.id } }, orderBy: { exam: { performedAt: 'desc' } }, select: { name: true, nameCanonical: true } }),
      prisma.patient.findUnique({ where: { id: patient.id }, select: { clinicalProfile: true } }),
    ]);
    const segText = `${lastAbn?.nameCanonical ?? ''} ${lastAbn?.name ?? ''} ${prof?.clinicalProfile ?? ''}`;
    const seg = classifySegment(segText);
    type = 'tip';
    title = `💡 Dica do Dr. Exame pra ${first}`;
    body = await getTipForSegment(seg);
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
