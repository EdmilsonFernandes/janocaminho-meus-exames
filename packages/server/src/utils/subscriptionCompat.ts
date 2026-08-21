import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../prisma';

type ColumnRow = { column_name: string };

export interface SubscriptionColumnSupport {
  hasPixResume: boolean;
  hasRawWebhook: boolean;
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
}

let subscriptionColumnsPromise: Promise<Set<string>> | null = null;

const BASE_COLUMNS = ['id', 'userId', 'mpPaymentId', 'mpPreferenceId', 'amount', 'periodDays', 'status', 'createdAt', 'updatedAt'] as const;
type BaseColumn = typeof BASE_COLUMNS[number];
type SubscriptionMutation = Partial<Pick<SubscriptionRecord, 'mpPaymentId' | 'mpPreferenceId' | 'status'>> & {
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
    WHERE table_schema = current_schema()
      AND table_name = 'subscriptions'
  `;
  return new Set(rows.map((row) => row.column_name));
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
  return {
    hasPixResume: ['pixExpiresAt', 'pixQrCode', 'pixQrBase64', 'pixCredits'].every((column) => columns.has(column)),
    hasRawWebhook: columns.has('rawWebhook'),
  };
}

export async function createSubscriptionCompat(data: {
  userId: string;
  amount: number;
  periodDays: number;
  status?: string;
}): Promise<SubscriptionRecord> {
  const support = await getSubscriptionColumnSupport();
  if (support.hasPixResume && support.hasRawWebhook) {
    return prisma.subscription.create({
      data: {
        userId: data.userId,
        amount: data.amount,
        periodDays: data.periodDays,
        status: data.status ?? 'PENDING',
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
      },
    });
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const rows = await prisma.$queryRawUnsafe<SubscriptionRecord[]>(
    `INSERT INTO "subscriptions" (${BASE_COLUMN_SQL})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${BASE_COLUMN_SQL}`,
    id,
    data.userId,
    null,
    null,
    data.amount,
    data.periodDays,
    data.status ?? 'PENDING',
    now,
    now,
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
