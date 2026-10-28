import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../prisma';

type ColumnRow = { column_name: string };

export interface SubscriptionColumnSupport {
  hasPixResume: boolean;
  hasRawWebhook: boolean;
  hasCoupon: boolean; // couponCode + couponDiscountCents (T3 cupons 28/10/26)
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  amount: number;
  periodDays: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  couponCode?: string | null;
  couponDiscountCents?: number | null;
}

let subscriptionColumnsPromise: Promise<Set<string>> | null = null;

const BASE_COLUMNS = ['id', 'userId', 'mpPaymentId', 'mpPreferenceId', 'amount', 'periodDays', 'status', 'createdAt', 'updatedAt'] as const;
type BaseColumn = typeof BASE_COLUMNS[number];
type SubscriptionMutation = Partial<Pick<SubscriptionRecord, 'mpPaymentId' | 'mpPreferenceId' | 'status' | 'couponCode' | 'couponDiscountCents'>> & {
  rawWebhook?: Prisma.JsonValue | null;
  pixQrCode?: string | null;
  pixQrBase64?: string | null;
  pixExpiresAt?: Date | null;
  pixCredits?: number | null;
};

const BASE_COLUMN_SQL = BASE_COLUMNS.map((column) => `"${column}"`).join(', ');

async function loadSubscriptionColumns(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<ColumnRow[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'subscriptions'
      AND (table_schema = current_schema() OR table_schema = 'public')
  `;
  const set = new Set(rows.map((row) => row.column_name));
  for (const col of Array.from(set)) {
    set.add(col.toLowerCase());
  }
  return set;
}

export async function getSubscriptionColumns(): Promise<Set<string>> {
  if (!subscriptionColumnsPromise) {
    subscriptionColumnsPromise = loadSubscriptionColumns().catch((error) => {
      subscriptionColumnsPromise = null;
      throw error;
    });
  }
  return subscriptionColumnsPromise;
}

export async function getSubscriptionColumnSupport(): Promise<SubscriptionColumnSupport> {
  const columns = await getSubscriptionColumns();
  const has = (name: string) => columns.has(name) || columns.has(name.toLowerCase());
  return {
    hasPixResume: ['pixExpiresAt', 'pixQrCode', 'pixQrBase64', 'pixCredits'].every(has),
    hasRawWebhook: has('rawWebhook'),
    hasCoupon: has('couponCode') && has('couponDiscountCents'),
  };
}

export async function createSubscriptionCompat(data: {
  userId: string;
  amount: number;
  periodDays: number;
  status?: string;
  /** Tag JSON em rawWebhook (ex.: {kind:'api_pack'}) — só entra quando a coluna existe.
   *  Usada pelo buy-api-pack pra separar PIX de CHAMADAS de PIX de CRÉDITOS na retomada. */
  rawWebhook?: any;
  /** Cupom aplicado no checkout (T3 28/10/26) — gravado JÁ na criação p/ o webhook
   *  incrementar uses + criar a CouponRedemption na aprovação. Só quando as colunas existem. */
  couponCode?: string;
  couponDiscountCents?: number;
}): Promise<SubscriptionRecord> {
  const support = await getSubscriptionColumnSupport();
  const couponData = support.hasCoupon && data.couponCode
    ? { couponCode: data.couponCode, couponDiscountCents: Math.max(0, data.couponDiscountCents ?? 0) }
    : {};
  if (support.hasPixResume && support.hasRawWebhook) {
    return prisma.subscription.create({
      data: {
        userId: data.userId,
        amount: data.amount,
        periodDays: data.periodDays,
        status: data.status ?? 'PENDING',
        ...(data.rawWebhook != null ? { rawWebhook: data.rawWebhook } : {}),
        ...couponData,
      },
      select: {
        id: true,
        userId: true,
        mpPaymentId: true,
        mpPreferenceId: true,
        amount: true,
        periodDays: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        ...(support.hasCoupon ? { couponCode: true, couponDiscountCents: true } : {}),
      },
    });
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const couponCols = support.hasCoupon && data.couponCode
    ? { sql: ', "couponCode", "couponDiscountCents"', values: [data.couponCode, Math.max(0, data.couponDiscountCents ?? 0)] as (string | number | Date)[] }
    : { sql: '', values: [] as (string | number | Date)[] };
  const placeholders = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `$${n}`).join(', ')
    + (couponCols.values.length ? ', $10, $11' : '');
  const rows = await prisma.$queryRawUnsafe<SubscriptionRecord[]>(
    `INSERT INTO "subscriptions" (${BASE_COLUMN_SQL}${couponCols.sql})
     VALUES (${placeholders})
     RETURNING ${BASE_COLUMN_SQL}${couponCols.sql}`,
    id,
    data.userId,
    null,
    null,
    data.amount,
    data.periodDays,
    data.status ?? 'PENDING',
    now,
    now,
    ...couponCols.values,
  );
  return rows[0]!;
}

export async function findSubscriptionByIdCompat(id: string): Promise<SubscriptionRecord | null> {
  const support = await getSubscriptionColumnSupport();
  if (support.hasPixResume && support.hasRawWebhook) {
    return prisma.subscription.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        mpPaymentId: true,
        mpPreferenceId: true,
        amount: true,
        periodDays: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        ...(support.hasCoupon ? { couponCode: true, couponDiscountCents: true } : {}),
      },
    });
  }

  const rows = await prisma.$queryRawUnsafe<SubscriptionRecord[]>(
    `SELECT ${BASE_COLUMN_SQL}
     FROM "subscriptions"
     WHERE "id" = $1
     LIMIT 1`,
    id,
  );
  return rows[0] ?? null;
}

export async function updateSubscriptionCompat(id: string, data: SubscriptionMutation): Promise<void> {
  return updateSubscriptionCompatWithDb(prisma, id, data);
}

export async function updateSubscriptionCompatWithDb(db: any, id: string, data: SubscriptionMutation): Promise<void> {
  const support = await getSubscriptionColumnSupport();
  const columns = await getSubscriptionColumns();
  const updates = Object.entries(data).filter(([, value]) => value !== undefined);
  if (!updates.length) return;

  const allowedColumns = new Set<string>([
    'mpPaymentId',
    'mpPreferenceId',
    'status',
    ...(support.hasRawWebhook ? ['rawWebhook'] : []),
    ...(support.hasPixResume ? ['pixQrCode', 'pixQrBase64', 'pixExpiresAt', 'pixCredits'] : []),
    ...(support.hasCoupon ? ['couponCode', 'couponDiscountCents'] : []),
  ]);
  const filteredUpdates = updates
    .filter(([column]) => allowedColumns.has(column) && columns.has(column))
    .map(([column, value]) => ({ column, value }));

  if (!filteredUpdates.length) return;

  const sqlAssignments = filteredUpdates.map(({ column }, index) => `"${column}" = $${index + 2}`);
  sqlAssignments.push(`"updatedAt" = $${filteredUpdates.length + 2}`);
  const values = filteredUpdates.map(({ value }) => value);

  if (support.hasPixResume && support.hasRawWebhook) {
    await db.subscription.update({
      where: { id },
      data,
      select: { id: true },
    });
    return;
  }

  await db.$executeRawUnsafe(
    `UPDATE "subscriptions"
     SET ${sqlAssignments.join(', ')}
     WHERE "id" = $1`,
    id,
    ...values,
    new Date(),
  );
}

export function resetSubscriptionColumnsCacheForTests(): void {
  subscriptionColumnsPromise = null;
}
