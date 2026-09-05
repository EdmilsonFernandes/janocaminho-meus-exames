import { prisma } from '../prisma';
import { sendPushToUser } from './push';

/**
 * pushAudience — resolução de PÚBLICOS-ALVO pra campanhas de push do admin.
 *
 * O PushTab histórico só tinha broadcast global. Aqui cada grupo (plano, engajamento,
 * exames, atividade) vira um filtro Prisma/pós-processo — interseção entre grupos,
 * união nunca (2 picks no mesmo grupo não faz sentido: são mutuamente excludentes).
 *
 * ZERO schema novo: tudo lê campos antigos e estáveis (User.planExpiresAt/streakDays/
 * lastActiveDay, Exam.status/performedAt, ExamItem.isAbnormal, Measurement HC) —
 * respeitando a regra de drift (nada de depender de coluna recém-nascida).
 *
 * Merge fields (F2): {{nome}}, {{streak}}, {{passosOntem}} — resolvidos POR USUÁRIO
 * no momento do envio (dispatchCampaign).
 */

export type AudienceFilter = {
  /** Plano do usuário. */
  plan?: 'free' | 'premium' | 'premiumExpiring7d';
  /** Engajamento com o app. */
  engagement?: 'active7d' | 'inactive14d' | 'noFirstExam';
  /** Histórico de exames. */
  exams?: 'stale90d' | 'abnormal30d';
  /** Atividade física (Health Connect → measurements note='Health Connect'). */
  activity?: 'hcConnected' | 'lowActivity3d' | 'goalHitYesterday';
  /** Exclui quem recebeu push manual há menos de N dias (default 7; 0 = desliga). */
  excludeRecentManualDays?: number;
};

export const MANUAL_PUSH_TYPE = 'manual_push';
const DEFAULT_EXCLUDE_DAYS = 7;
/** Meta de passos — espelha ACTIVITY_STEP_GOAL do measurement.routes e STEPS_GOAL do web. */
const STEPS_GOAL = 8000;

/** YYYY-MM-DD (UTC) de N dias atrás — lastActiveDay é string nesse formato. */
const dayStr = (offsetDays: number): string => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);

/** Sanitiza o filtro vindo do admin: só chaves/valores conhecidos. */
export function parseAudienceFilter(raw: unknown): AudienceFilter {
  const f = (raw ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(key: string, allowed: readonly string[]): T | undefined => {
    const v = f[key];
    return typeof v === 'string' && allowed.includes(v) ? (v as T) : undefined;
  };
  const days = Number(f.excludeRecentManualDays);
  return {
    ...(pick('plan', ['free', 'premium', 'premiumExpiring7d']) ? { plan: pick('plan', ['free', 'premium', 'premiumExpiring7d']) } : {}),
    ...(pick('engagement', ['active7d', 'inactive14d', 'noFirstExam']) ? { engagement: pick('engagement', ['active7d', 'inactive14d', 'noFirstExam']) } : {}),
    ...(pick('exams', ['stale90d', 'abnormal30d']) ? { exams: pick('exams', ['stale90d', 'abnormal30d']) } : {}),
    ...(pick('activity', ['hcConnected', 'lowActivity3d', 'goalHitYesterday']) ? { activity: pick('activity', ['hcConnected', 'lowActivity3d', 'goalHitYesterday']) } : {}),
    ...(Number.isFinite(days) ? { excludeRecentManualDays: Math.max(0, Math.min(90, Math.round(days))) } : {}),
  };
}

/** Passos diários (HC) por ownerId nos últimos `days` dias (dedup por dia, desc). */
export async function hcStepsByOwner(days: number): Promise<Map<string, { date: string; value: number }[]>> {
  const rows = await prisma.measurement.findMany({
    where: { type: 'STEPS', note: 'Health Connect', measuredAt: { gte: new Date(Date.now() - days * 86400000) } },
    select: { value: true, measuredAt: true, patient: { select: { ownerId: true } } },
    orderBy: { measuredAt: 'desc' },
    take: 5000,
  });
  const byOwner = new Map<string, { date: string; value: number }[]>();
  for (const r of rows) {
    // Mesma convenção de dia do activity-summary/hr-trend (o sync grava T12:00 → slice UTC estável)
    const date = r.measuredAt.toISOString().slice(0, 10);
    const arr = byOwner.get(r.patient.ownerId) ?? [];
    if (!arr.some((d) => d.date === date)) arr.push({ date, value: r.value }); // dedup dia (desc → 1º = mais recente)
    byOwner.set(r.patient.ownerId, arr);
  }
  return byOwner;
}

/** Média de passos dos dias cuja data (YYYY-MM-DD) casa o predicate. */
const avgSteps = (days: { date: string; value: number }[], from: number, to: number): number | null => {
  const lo = dayStr(to), hi = dayStr(from);
  const inRange = days.filter((d) => d.date >= lo && d.date <= hi && d.date <= dayStr(1)); // ontem pra trás (hoje ainda incompleto)
  return inRange.length ? inRange.reduce((t, d) => t + d.value, 0) / inRange.length : null;
};

/**
 * Resolve os userIds da audiência. Sempre restringe a usuários ALCANÇÁVEIS
 * (≥1 device token, não bloqueados) — audiência que não recebe push não é audiência.
 */
export async function resolveAudienceUserIds(filter: AudienceFilter): Promise<string[]> {
  const now = new Date();
  const where: Record<string, unknown> = {
    blocked: false,
    deviceTokens: { some: {} },
  };
  // Condições acumulativas — interseção entre grupos (AND no topo, AND dentro do patient).
  const patientConds: Record<string, unknown>[] = [];
  const nots: Record<string, unknown>[] = [];

  // ── plano ──────────────────────────────────────────────────────────────────
  if (filter.plan === 'free') where.OR = [{ planExpiresAt: null }, { planExpiresAt: { lte: now } }];
  if (filter.plan === 'premium') where.planExpiresAt = { gt: now };
  if (filter.plan === 'premiumExpiring7d') where.planExpiresAt = { gt: now, lt: new Date(now.getTime() + 7 * 86400000) };

  // ── engajamento ────────────────────────────────────────────────────────────
  if (filter.engagement === 'active7d') where.lastActiveDay = { gte: dayStr(7) };
  if (filter.engagement === 'inactive14d') where.lastActiveDay = { not: null, lte: dayStr(14) };
  if (filter.engagement === 'noFirstExam') {
    patientConds.push({});
    nots.push({ patients: { some: { exams: { some: { status: 'EXTRACTED' } } } } });
  }

  // ── exames ─────────────────────────────────────────────────────────────────
  if (filter.exams === 'stale90d') {
    const cutoff = new Date(Date.now() - 90 * 86400000);
    // tem exame extraído ANTIGO e NENHUM recente (>90d sem exame novo)
    patientConds.push({ exams: { some: { status: 'EXTRACTED', performedAt: { lt: cutoff } } } });
    nots.push({ patients: { some: { exams: { some: { status: 'EXTRACTED', performedAt: { gte: cutoff } } } } } });
  }
  if (filter.exams === 'abnormal30d') {
    const cutoff = new Date(Date.now() - 30 * 86400000);
    patientConds.push({ exams: { some: { status: 'EXTRACTED', performedAt: { gte: cutoff }, items: { some: { isAbnormal: true } } } } });
  }

  // ── atividade (Health Connect) ─────────────────────────────────────────────
  if (filter.activity === 'hcConnected') patientConds.push({ measurements: { some: { note: 'Health Connect' } } });

  if (patientConds.length) where.patients = { some: { AND: patientConds } };
  const excludeDays = filter.excludeRecentManualDays ?? DEFAULT_EXCLUDE_DAYS;
  if (excludeDays > 0) {
    nots.push({ notifications: { some: { type: MANUAL_PUSH_TYPE, createdAt: { gte: new Date(Date.now() - excludeDays * 86400000) } } } });
  }
  // Forma ARRAY: NOT [a, b] ≡ ¬a ∧ ¬b (cada exclusão é independente). O formato
  // objeto `NOT: { AND: [...] }` seria ¬(a∧b) — deixaria passar quem casa SÓ UMA.
  if (nots.length) where.NOT = nots;

  const users = await prisma.user.findMany({ where: where as never, select: { id: true }, take: 10000 });
  let ids = users.map((u) => u.id);

  // Segmentos de atividade que dependem de MÉDIA/valores — pós-processo em JS (escala pequena).
  if (filter.activity === 'lowActivity3d' || filter.activity === 'goalHitYesterday') {
    const byOwner = await hcStepsByOwner(filter.activity === 'lowActivity3d' ? 35 : 2);
    ids = ids.filter((id) => {
      const days = byOwner.get(id);
      if (!days?.length) return false;
      if (filter.activity === 'goalHitYesterday') return (days.find((d) => d.date === dayStr(1))?.value ?? 0) >= STEPS_GOAL;
      // queda: média 3d < 50% da média 30d anterior (mín 2 dias com dado na janela 3d; base ≥ 4k/dia p/ não nadar em ruído)
      const avg3 = avgSteps(days, 1, 3);
      const avg30 = avgSteps(days, 4, 33);
      return avg3 != null && days.filter((d) => d.date >= dayStr(3) && d.date <= dayStr(1)).length >= 2
        && avg30 != null && avg30 >= 4000 && avg3 < avg30 * 0.5;
    });
  }
  return ids;
}

/** Passos de ONTEM por ownerId (merge field {{passosOntem}}). */
async function stepsYesterdayByOwner(): Promise<Map<string, number>> {
  const byOwner = await hcStepsByOwner(2);
  const out = new Map<string, number>();
  for (const [owner, days] of byOwner) {
    const v = days.find((d) => d.date === dayStr(1))?.value;
    if (v != null) out.set(owner, v);
  }
  return out;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || 'você';
const fmtInt = (n: number): string => n.toLocaleString('pt-BR');

/** Substitui {{nome}}, {{streak}}, {{passosOntem}} no título/corpo da campanha. */
export function applyMergeFields(text: string, ctx: { name: string; streakDays: number; stepsYesterday?: number }): string {
  return text
    .replace(/\{\{\s*nome\s*\}\}/g, firstName(ctx.name))
    .replace(/\{\{\s*streak\s*\}\}/g, String(ctx.streakDays ?? 0))
    .replace(/\{\{\s*passosOntem\s*\}\}/g, ctx.stepsYesterday != null ? fmtInt(ctx.stepsYesterday) : 'seus passos de ontem');
}

/**
 * Dispara a campanha segmentada: resolve a audiência e envia 1-a-1 (sendPushToUser
 * já cria a Notification in-app — que é o que alimenta o cap anti-spam — e o FCM
 * pros devices do usuário). Merge fields resolvidos por usuário.
 */
export async function dispatchCampaign(opts: { title: string; body: string; route?: string; filter: AudienceFilter }): Promise<{ sent: number }> {
  const ids = await resolveAudienceUserIds(opts.filter);
  if (!ids.length) return { sent: 0 };
  const stepsYesterday = /passosOntem/.test(`${opts.title} ${opts.body}`) ? await stepsYesterdayByOwner() : null;
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, streakDays: true } });
  let sent = 0;
  for (const u of users) {
    const ctx = { name: u.name, streakDays: u.streakDays, stepsYesterday: stepsYesterday?.get(u.id) };
    await sendPushToUser(u.id, applyMergeFields(opts.title, ctx), applyMergeFields(opts.body, ctx), {
      type: MANUAL_PUSH_TYPE,
      ...(opts.route ? { route: opts.route } : {}),
    }).catch((e) => console.error('[pushCampaign] falha user', u.id, (e as Error).message));
    sent++;
  }
  return { sent };
}
