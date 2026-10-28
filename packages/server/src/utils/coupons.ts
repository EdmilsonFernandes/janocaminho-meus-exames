// CUPOM DE DESCONTO NO CHECKOUT (T3 insights Conexa, 28/10/26) — lógica compartilhada
// entre o endpoint de validação (pré-visualização do front) e a APLICAÇÃO REAL no
// checkout (server-side SEMPRE revalida; o front nunca define o preço).
//
// Regras v1 (simples e seguras):
//   - code normalizado UPPERCASE sem acento (mesmo espírito do normalizeCrmKey);
//   - active + expiresAt + maxUses>uses + appliesTo casam com o produto;
//   - 1 redenção por USUÁRIO por TIPO (@@unique couponId+userId+kind);
//   - `uses` incrementa SÓ na aprovação do pagamento (webhook/pay-card confirmado),
//     nunca na criação da cobrança (PIX abandonado não consome cupom).
import { prisma } from '../prisma';

export type CouponKind = 'plan_monthly' | 'credits';

/** Erro de cupom com status HTTP associado (404 inválido/expirado, 410 esgotado, 409 já usado). */
export class CouponError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'CouponError';
  }
}

/** UPPERCASE, sem acento, só [A-Z0-9] — "Fundador 10%" → "FUNDADOR10". */
export function normalizeCouponCode(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export interface CouponRecord {
  id: string;
  code: string;
  kind: string; // 'percent' | 'fixed_cents'
  value: number;
  appliesTo: string;
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  active: boolean;
  notes: string | null;
}

/** Desconto em centavos (percent = floor, nunca arredonda pra cima; fixed nunca passa do valor). */
export function couponDiscountCents(coupon: Pick<CouponRecord, 'kind' | 'value'>, amountCents: number): number {
  if (coupon.kind === 'percent') {
    const pct = Math.min(100, Math.max(0, Math.floor(coupon.value)));
    return Math.floor((amountCents * pct) / 100);
  }
  // fixed_cents: valor em centavos, limitado ao próprio valor da compra.
  return Math.min(Math.max(0, Math.floor(coupon.value)), amountCents);
}

export interface CouponValidation {
  coupon: CouponRecord;
  code: string;
  kind: CouponKind;
  discountCents: number;
  finalCents: number;
}

/**
 * Valida o cupom p/ (userId, kind, amountCents). Lança CouponError com status HTTP:
 *   404 inválido/inativo/expirado/aplica a outro produto · 410 esgotado ·
 *   409 já usado por este usuário · 400 desconto cobre o valor total (charge zero).
 */
export async function validateCouponForUser(input: {
  code: string;
  userId: string;
  kind: CouponKind;
  amountCents: number;
}): Promise<CouponValidation> {
  const code = normalizeCouponCode(input.code);
  if (!code || code.length < 2 || code.length > 32) throw new CouponError(404, 'Cupom inválido ou expirado.');

  const coupon = (await prisma.coupon.findUnique({ where: { code } })) as CouponRecord | null;
  if (!coupon || !coupon.active) throw new CouponError(404, 'Cupom inválido ou expirado.');
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) throw new CouponError(404, 'Cupom inválido ou expirado.');
  if (coupon.appliesTo !== 'any' && coupon.appliesTo !== input.kind) throw new CouponError(404, 'Cupom inválido ou expirado.');
  if (coupon.maxUses != null && coupon.uses >= coupon.maxUses) throw new CouponError(410, 'Cupom esgotado.');

  const redeemed = await prisma.couponRedemption.findUnique({
    where: { couponId_userId_kind: { couponId: coupon.id, userId: input.userId, kind: input.kind } },
    select: { id: true },
  });
  if (redeemed) throw new CouponError(409, 'Você já usou este cupom.');

  const discountCents = couponDiscountCents(coupon, input.amountCents);
  const finalCents = input.amountCents - discountCents;
  if (finalCents < 1) throw new CouponError(400, 'Cupom não aplicável: o desconto cobre o valor total.');

  return { coupon, code, kind: input.kind, discountCents, finalCents };
}

/**
 * Registra a redenção NA APROVAÇÃO do pagamento (billingApproval). Fora da transação de
 * créditos de propósito (mesma filosofia do founder/ledger): falha aqui NUNCA derruba a
 * aprovação. Incremento condicional (uses < maxUses OU ilimitado) — corrida na última
 * vaga não estoura o limite. Conflito de redenção única (compra dupla em corrida) devolve
 * o incremento. Log só com o código (LGPD: nada sensível aqui).
 */
export async function recordCouponRedemption(sub: {
  userId: string;
  amount: number;
  couponCode?: string | null;
  couponDiscountCents?: number | null;
}, kind: CouponKind): Promise<void> {
  const code = sub.couponCode;
  if (!code) return;
  try {
    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) {
      console.warn(`[coupon] redemption ignorada — código ${code} não existe mais`);
      return;
    }
    const claimed = await prisma.coupon.updateMany({
      where: { id: coupon.id, OR: [{ maxUses: null }, { uses: { lt: prisma.coupon.fields.maxUses } }] },
      data: { uses: { increment: 1 } },
    });
    if (claimed.count === 0) {
      console.warn(`[coupon] redemption ignorada — ${code} esgotado entre checkout e aprovação`);
      return;
    }
    try {
      await prisma.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId: sub.userId,
          kind,
          amountCentsOriginal: Math.round(sub.amount * 100) + Math.max(0, sub.couponDiscountCents ?? 0),
          discountCents: Math.max(0, sub.couponDiscountCents ?? 0),
        },
      });
      console.log(`[coupon] ${code} redimido (kind=${kind}, -${sub.couponDiscountCents ?? 0}c) por user ${sub.userId}`);
    } catch (e: any) {
      // Redenção única por user+kind já existia (corrida) → devolve o incremento.
      if (String(e?.code) === 'P2002') {
        await prisma.coupon.update({ where: { id: coupon.id }, data: { uses: { decrement: 1 } } }).catch(() => {});
        console.warn(`[coupon] ${code}: user ${sub.userId} já tinha redimido (kind=${kind})`);
      } else throw e;
    }
  } catch (e) {
    console.error(`[coupon] falha ao registrar redenção de ${code}:`, (e as Error).message);
  }
}
