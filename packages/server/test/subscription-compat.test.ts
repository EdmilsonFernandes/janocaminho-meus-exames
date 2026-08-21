import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/prisma';
import { getSubscriptionColumnSupport, resetSubscriptionColumnsCacheForTests } from '../src/utils/subscriptionCompat';

describe('subscriptionCompat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSubscriptionColumnsCacheForTests();
  });

  it('detecta schema legado sem colunas de PIX nem rawWebhook', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { column_name: 'id' },
      { column_name: 'userId' },
      { column_name: 'mpPaymentId' },
      { column_name: 'mpPreferenceId' },
      { column_name: 'amount' },
      { column_name: 'periodDays' },
      { column_name: 'status' },
      { column_name: 'createdAt' },
      { column_name: 'updatedAt' },
    ] as never);

    await expect(getSubscriptionColumnSupport()).resolves.toEqual({
      hasPixResume: false,
      hasRawWebhook: false,
    });
  });

  it('detecta schema atual com suporte total', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { column_name: 'id' },
      { column_name: 'userId' },
      { column_name: 'mpPaymentId' },
      { column_name: 'mpPreferenceId' },
      { column_name: 'amount' },
      { column_name: 'periodDays' },
      { column_name: 'status' },
      { column_name: 'createdAt' },
      { column_name: 'updatedAt' },
      { column_name: 'rawWebhook' },
      { column_name: 'pixExpiresAt' },
      { column_name: 'pixQrCode' },
      { column_name: 'pixQrBase64' },
      { column_name: 'pixCredits' },
    ] as never);

    await expect(getSubscriptionColumnSupport()).resolves.toEqual({
      hasPixResume: true,
      hasRawWebhook: true,
    });
  });
});
