/**
 * Worker de preços — assíncrono, NUNCA no fluxo do cadastro (FASE 5).
 * Cron no boot (padrão startReminderEmailJob): tick a cada 5 min processa até 8
 * remédios (queued + available-expirados p/ refresh). Cache global por chave (FASE 6):
 * 500 pacientes com a mesma Losartana 50mg/30cp compartilham UM snapshot (TTL 6h).
 */
import { prisma } from '../prisma';
import { buildNormalizedMedication, isKeyComplete } from './normalize';
import { ProviderRegistry, priceProvidersEnabled, type MedicationPriceProvider, type PriceOffer } from './provider';

const TTL_MS = 6 * 60 * 60 * 1000; // 6h: preço de farmácia muda no dia, não no minuto
const BATCH = 8;

export type WorkerOutcome = 'available' | 'no_results' | 'insufficient_data' | 'provider_error' | 'cached';

async function ensureSnapshot(key: string, offers: PriceOffer[], providerName: string) {
  const now = new Date();
  const lowest = offers.length ? Math.min(...offers.map((o) => o.priceCents)) : null;
  const avg = offers.length ? Math.round(offers.reduce((s, o) => s + o.priceCents, 0) / offers.length) : null;

  // UPSERT que SEMPRE substitui as ofertas (o update do prisma.upsert não toca
  // em relações — sem isto, offers antigas/vazias ficavam pra sempre)
  const existing = await prisma.medicationPriceSnapshot.findUnique({
    where: { medicationKey_locationKey: { medicationKey: key, locationKey: 'BR' } },
    select: { id: true },
  });
  if (existing) {
    // ATUALIZA: apaga offers antigas + cria as novas + atualiza números
    await prisma.$transaction([
      prisma.medicationPriceOffer.deleteMany({ where: { snapshotId: existing.id } }),
      ...(offers.length ? [prisma.medicationPriceOffer.createMany({
        data: offers.map((o) => ({ snapshotId: existing.id, pharmacy: o.pharmacy, productName: o.productName, priceCents: o.priceCents, url: o.url, imageUrl: o.imageUrl ?? null, ean: o.ean ?? null, lastCheckedAt: now })),
      })] : []),
      prisma.medicationPriceSnapshot.update({
        where: { id: existing.id },
        data: { lowestPriceCents: lowest, averagePriceCents: avg, offersCount: offers.length, provider: providerName, collectedAt: now, expiresAt: new Date(now.getTime() + TTL_MS) },
      }),
    ]);
    return prisma.medicationPriceSnapshot.findUnique({ where: { id: existing.id } });
  }
  // CRIA: snapshot + offers juntas
  return prisma.medicationPriceSnapshot.create({
    data: {
      medicationKey: key, locationKey: 'BR', lowestPriceCents: lowest, averagePriceCents: avg,
      offersCount: offers.length, provider: providerName, collectedAt: now, expiresAt: new Date(now.getTime() + TTL_MS),
      offers: { create: offers.map((o) => ({ pharmacy: o.pharmacy, productName: o.productName, priceCents: o.priceCents, url: o.url, imageUrl: o.imageUrl ?? null, ean: o.ean ?? null, lastCheckedAt: now })) },
    },
  });
}

/** Processa UM medicamento. Exportada p/ testes (com provider injetado). */
export async function processMedicationPrice(medId: string, provider: MedicationPriceProvider | null = ProviderRegistry.default): Promise<WorkerOutcome> {
  const med = await prisma.medication.findUnique({ where: { id: medId } });
  if (!med || !med.active) return 'no_results';

  const normalized = buildNormalizedMedication(med);
  // Persiste o enriquecimento (cadastro continua simples — o sistema normaliza)
  await prisma.medication.update({
    where: { id: med.id },
    data: {
      nameNormalized: normalized.medicationKey, activeIngredient: normalized.activeIngredient,
      dosageValue: normalized.dosageValue ?? null, dosageUnit: normalized.dosageUnit ?? null,
      form: normalized.form ?? null, packQty: normalized.packQty ?? null,
    },
  });

  if (!isKeyComplete(normalized.medicationKey)) {
    await prisma.medication.update({ where: { id: med.id }, data: { priceStatus: 'insufficient_data' } });
    return 'insufficient_data';
  }

  // Cache global: snapshot fresco? reaproveita (não consulta de novo)
  const fresh = await prisma.medicationPriceSnapshot.findFirst({
    where: { medicationKey: normalized.medicationKey!, locationKey: 'BR', expiresAt: { gt: new Date() } },
  });
  if (fresh) {
    await prisma.medication.update({ where: { id: med.id }, data: { priceStatus: 'available', priceCheckedAt: new Date() } });
    return 'cached';
  }

  // Sem fonte real habilitada (flag OFF / nenhum provider): honesto — volta pra
  // not_requested SEM erro (card limpo; liga quando uma fonte sustentável entrar).
  if (!provider || !priceProvidersEnabled()) {
    await prisma.medication.update({ where: { id: med.id }, data: { priceStatus: 'not_requested' } });
    return 'no_results';
  }

  await prisma.medication.update({ where: { id: med.id }, data: { priceStatus: 'searching' } });
  try {
    const offers = await provider.search(normalized);
    await ensureSnapshot(normalized.medicationKey!, offers, provider.name);
    const status = offers.length ? 'available' : 'no_results';
    await prisma.medication.update({ where: { id: med.id }, data: { priceStatus: status, priceCheckedAt: new Date() } });
    return status;
  } catch (e) {
    console.warn('[pricing] provider falhou p/', med.name, ':', (e as Error).message?.slice(0, 120));
    await prisma.medication.update({ where: { id: med.id }, data: { priceStatus: 'provider_error', priceCheckedAt: new Date() } });
    return 'provider_error';
  }
}

export async function runPriceWorkerTick(provider: MedicationPriceProvider | null = ProviderRegistry.default): Promise<{ processed: number }> {
  // Kill-switch NÃO abandona a fila: meds em queued são resolvidas p/ not_requested
  // (card limpo, sem erro) — processMedicationPrice cuida do caso desligado.
  const staleBefore = new Date(Date.now() - TTL_MS);
  const retryBefore = new Date(Date.now() - 60 * 60 * 1000); // provider_error: retry 1x/h (site caído não vira martelo)
  const meds = await prisma.medication.findMany({
    where: {
      active: true,
      OR: [
        { priceStatus: 'queued' },
        { priceStatus: 'available', priceCheckedAt: { lt: staleBefore } },
        { priceStatus: 'provider_error', priceCheckedAt: { lt: retryBefore } },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: BATCH,
    select: { id: true },
  });
  for (const m of meds) await processMedicationPrice(m.id, provider);
  return { processed: meds.length };
}

export function startPriceWorkerJob(): void {
  const tick = () => { void runPriceWorkerTick().catch((e) => console.warn('[pricing] tick:', (e as Error).message)); };
  setTimeout(tick, 10_000); // 1º tick 10s após o boot (deixa o app subir primeiro)
  setInterval(tick, 30 * 1000); // 30s: usuário cadastra → preço chega em <30s (não 5min)
}
