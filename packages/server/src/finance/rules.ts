// §18.2 — REGRAS DE COMISSÃO (Onda 2, fundação financeira).
// Arquitetura A: docs/design/2026-10-24-finance-architecture.md §4.
//
// Precedência na VIGÊNCIA: regra específica do médico > regra GERAL (doctorId null).
// D1-D9 PENDENTES → defaults aqui são HIPÓTESES explícitas (mesmos defaults do schema,
// editáveis no admin via POST /admin/commission-rules — nunca número mágico no código).
import { prisma } from '../prisma';

export const DEFAULT_COMMISSION_RULE = {
  platformBps: 2000, // 20% plataforma (hipótese D1)
  feeBearer: 'platform', // quem paga taxa do provedor (hipótese D2)
  releaseDelayDays: 3, // liberação D+N (hipótese D3)
  minPayoutCents: 2000, // piso de repasse (hipótese D7)
} as const;

/** Snapshot congelado — o formato EXATO gravado no Reminder.commissionSnapshot e
 *  copiado em cada LedgerEntry.ruleSnapshot. Mudança de regra NUNCA recalcula o
 *  passado (§18.2/§15.3): toda escrita de ledger copia DAQUI, não da tabela viva. */
export interface CommissionSnapshot {
  ruleId: string | null; // null = default (sem regra cadastrada — hipótese vigente)
  platformBps: number;
  feeBearer: 'platform' | 'doctor';
  releaseDelayDays: number;
  minPayoutCents: number;
}

function isVigente(rule: { validFrom: Date; validTo: Date | null }, now: Date): boolean {
  return rule.validFrom <= now && (rule.validTo == null || rule.validTo > now);
}

/** Snapshot da regra vigente para um médico (específica > geral > default hipótese).
 *  `now` injetável p/ teste determinístico. */
export async function resolveCommissionRule(doctorId: string | null, now: Date = new Date()): Promise<CommissionSnapshot> {
  // Sem FK/join: duas queries simples, cache desnecessário (agendamento é raro).
  const specific = doctorId
    ? await prisma.commissionRule.findFirst({
        where: { doctorId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
        orderBy: { validFrom: 'desc' },
      }).catch(() => null)
    : null;
  if (specific && isVigente(specific, now)) {
    return {
      ruleId: specific.id,
      platformBps: specific.platformBps,
      feeBearer: specific.feeBearer === 'doctor' ? 'doctor' : 'platform',
      releaseDelayDays: specific.releaseDelayDays,
      minPayoutCents: specific.minPayoutCents,
    };
  }
  const general = await prisma.commissionRule.findFirst({
    where: { doctorId: null, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
    orderBy: { validFrom: 'desc' },
  }).catch(() => null);
  if (general && isVigente(general, now)) {
    return {
      ruleId: general.id,
      platformBps: general.platformBps,
      feeBearer: general.feeBearer === 'doctor' ? 'doctor' : 'platform',
      releaseDelayDays: general.releaseDelayDays,
      minPayoutCents: general.minPayoutCents,
    };
  }
  return { ruleId: null, ...DEFAULT_COMMISSION_RULE };
}

/** Valida snapshot vinda do banco (legado/corrupta → default defensivo). */
export function coerceSnapshot(raw: unknown): CommissionSnapshot {
  const s = (raw ?? {}) as Partial<CommissionSnapshot>;
  const bps = Number(s.platformBps);
  const feeBearer = s.feeBearer === 'doctor' ? 'doctor' : 'platform';
  const delay = Number(s.releaseDelayDays);
  const min = Number(s.minPayoutCents);
  return {
    ruleId: typeof s.ruleId === 'string' ? s.ruleId : null,
    platformBps: Number.isInteger(bps) && bps >= 0 && bps <= 10_000 ? bps : DEFAULT_COMMISSION_RULE.platformBps,
    feeBearer,
    releaseDelayDays: Number.isInteger(delay) && delay >= 0 ? delay : DEFAULT_COMMISSION_RULE.releaseDelayDays,
    minPayoutCents: Number.isInteger(min) && min >= 0 ? min : DEFAULT_COMMISSION_RULE.minPayoutCents,
  };
}

/** Data de elegibilidade de liberação: paidAt + releaseDelayDays da snapshot. */
export function computeReleaseEligibleAt(paidAt: Date, snapshot: CommissionSnapshot): Date {
  return new Date(paidAt.getTime() + snapshot.releaseDelayDays * 86_400_000);
}

// §Coorte Fundador — promessa da landing /para-medicos: os primeiros N médicos
// aprovados têm taxa reduzida PARA SEMPRE (regra individual é imune à regra geral).
// O cap é contado pelas regras individuais ativas com platformBps = FOUNDER_BPS.
export const FOUNDER_BPS = 500; // 5% ("taxa Fundador de 5%")
export const FOUNDER_LIMIT = 50; // "primeiros 50 médicos"

export type FounderRuleOutcome =
  | { created: true; reason: 'created'; founderCount: number }
  | { created: false; reason: 'already' | 'full'; founderCount?: number };

/** Garante a regra individual Fundador (500 bps) para um médico recém-aprovado.
 *  Idempotente (já tem regra específica ativa → 'already'); respeita o cap da
 *  coorte ('full'). Sem transação: aprovação é evento raro e manual; a corrida
 *  teórica de dois approvals simultâneos só poderia estourar o cap em 1. */
export async function ensureFounderRule(doctorId: string, now: Date = new Date()): Promise<FounderRuleOutcome> {
  const specific = await prisma.commissionRule.findFirst({
    where: { doctorId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
  });
  if (specific) return { created: false, reason: 'already' };
  const founderCount = await prisma.commissionRule.count({
    where: {
      doctorId: { not: null },
      platformBps: FOUNDER_BPS,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
  });
  if (founderCount >= FOUNDER_LIMIT) return { created: false, reason: 'full', founderCount };
  await prisma.commissionRule.create({
    data: {
      doctorId,
      platformBps: FOUNDER_BPS,
      feeBearer: DEFAULT_COMMISSION_RULE.feeBearer,
      releaseDelayDays: DEFAULT_COMMISSION_RULE.releaseDelayDays,
      minPayoutCents: DEFAULT_COMMISSION_RULE.minPayoutCents,
      validFrom: now,
    },
  });
  return { created: true, reason: 'created', founderCount: founderCount + 1 };
}
