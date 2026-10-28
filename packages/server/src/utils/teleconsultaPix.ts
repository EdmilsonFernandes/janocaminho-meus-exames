// COBRANÇA PIX DE TELECONSULTA (extraído de billing.routes 27/10/26 p/ a fila imediata —
// spec docs/design/2026-10-27-fila-imediata-spec.md §3.2). Comportamento IDÊNTICO ao
// POST /billing/teleconsulta/:id original: Subscription PENDING + tag 'teleconsulta_<id>'
// (webhooks derivam o kind por ela), retomada do MESMO PIX vivo (padrão gateway) e 503
// quando o provedor falha (a Subscription vira FAILED — sem ordem órfã PENDING).
// A fila chama no MATCH (PIX 10min — startPixExpiryJob já roda o warning/expiração).
import { prisma } from '../prisma';
import { config } from '../config';
import { createSubscriptionCompat, getSubscriptionColumnSupport, updateSubscriptionCompat } from './subscriptionCompat';
import { createPixCharge, activePixProvider, pixProviderReady, type PixChargeResult } from '../payments/pix-provider';
import { cancelStalePendingPixes } from '../jobs/pix-expiry';
import { decryptPII } from './crypto';

/** CPF do pagador (paciente TITULAR da conta, descriptografado) — o Asaas exige CPF
 *  no customer p/ cobrança PIX (400 invalid_object sem ele, provado em prod 04/10).
 *  Undefined = sem CPF no cadastro → o provider pula o Asaas e o fallback assume. */
export async function payerCpfFor(userId: string): Promise<string | undefined> {
  const titular = await prisma.patient.findFirst({
    where: { ownerId: userId, relationship: 'Titular' },
    select: { cpfEncrypted: true, cpfIv: true },
  });
  return decryptPII(titular?.cpfEncrypted, titular?.cpfIv) ?? undefined;
}

/** notification_url só vale se for HTTPS público — localhost/HTTP faz o MP rejeitar
 *  ("notification_url attribute must be url valid"). Em dev (localhost) devolve undefined. */
export const publicNotifyUrl = (): string | undefined => {
  const u = config.mpNotificationUrl;
  return u && /^https:\/\/(?!localhost|127\.0\.0\.1)(?!.*\.local\b)/i.test(u) ? u : undefined;
};

/** Dados mínimos da teleconsulta p/ criar o PIX (o Reminder carrega title/owner/preço). */
export interface TeleconsultaPixReminder {
  id: string;
  ownerId: string;
  title: string;
  consultPriceCents: number | null;
}

export interface TeleconsultaPixPending {
  id: string;
  paymentId: string;
  qrCode: string;
  qrBase64: string;
  expiresAt: string;
  priceCents: number;
}

export type TeleconsultaPixResult =
  | ({ ok: true; reminderId: string; priceCents: number } & Omit<TeleconsultaPixPending, 'id' | 'priceCents'>)
  /** PIX vivo desta consulta (retomada) — caller devolve 409 com o MESMO QR/timer. */
  | { ok: false; kind: 'pending'; pendingPix: TeleconsultaPixPending }
  /** Provedor sem config ou falhou na criação (Subscription já FAILED). */
  | { ok: false; kind: 'unavailable'; message: string };

/** Cria (ou retoma) a cobrança PIX de uma teleconsulta particular. NUNCA lança — os
 *  ramos de falha voltam discriminados p/ o caller responder (409/503) igual à rota. */
export async function createTeleconsultaPix(
  reminder: TeleconsultaPixReminder,
  user: { id: string; name: string | null; email: string },
): Promise<TeleconsultaPixResult> {
  const priceCents = reminder.consultPriceCents ?? 0;
  if (priceCents <= 0) return { ok: false, kind: 'unavailable', message: 'Esta consulta não tem cobrança.' };
  if (!pixProviderReady()) return { ok: false, kind: 'unavailable', message: 'Pagamentos não configurados.' };

  const subscriptionColumns = await getSubscriptionColumnSupport();
  // RETOMADA (padrão gateway, igual plano/relatório): PIX vivo desta consulta → devolve o
  // MESMO QR/timer sem criar ordem nova.
  if (subscriptionColumns.hasPixResume) {
    await cancelStalePendingPixes().catch(() => {});
    const existing = await prisma.subscription.findFirst({
      where: { userId: user.id, status: 'PENDING', mpPreferenceId: `teleconsulta_${reminder.id}`, pixExpiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, mpPaymentId: true, pixQrCode: true, pixQrBase64: true, pixExpiresAt: true },
    });
    if (existing?.pixQrCode && existing?.pixQrBase64 && existing?.pixExpiresAt) {
      return {
        ok: false,
        kind: 'pending',
        pendingPix: {
          id: existing.id, paymentId: existing.mpPaymentId ?? '', qrCode: existing.pixQrCode,
          qrBase64: existing.pixQrBase64, expiresAt: existing.pixExpiresAt.toISOString(), priceCents,
        },
      };
    }
  }

  const sub = await createSubscriptionCompat({ userId: user.id, amount: priceCents / 100, periodDays: 0, status: 'PENDING' });
  // Tag da ordem (mesmo padrão 'report_pack'): webhooks Asaas/OpenPix casam por
  // mpPaymentId e derivam o kind pela tag; o MP casa pelo external_reference abaixo.
  await updateSubscriptionCompat(sub.id, { mpPreferenceId: `teleconsulta_${reminder.id}` });
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  let charge: PixChargeResult;
  try {
    charge = await createPixCharge({
      amountBrlCents: priceCents,
      correlationID: `teleconsulta_${sub.id}`, // único por ordem (OpenPix casa por mpPaymentId)
      externalReference: `${sub.id}|0|TELE:${reminder.id}`, // MP: webhook casa por subId|…|TELE:<reminderId>
      description: `Dr. Exame — Consulta particular: ${reminder.title.slice(0, 60)}`,
      payerEmail: user.email,
      payerFirstName: (user.name || 'Cliente').split(' ')[0],
      userId: user.id,
      payerName: user.name || undefined,
      payerCpfCnpj: await payerCpfFor(user.id),
      expiresAt: expires,
      notificationUrl: publicNotifyUrl(),
    });
  } catch (e) {
    console.error('[teleconsulta] PIX falhou (' + activePixProvider() + '):', (e as Error).message);
    await updateSubscriptionCompat(sub.id, { status: 'FAILED' });
    return { ok: false, kind: 'unavailable', message: 'Pagamento indisponível no momento — tente novamente em alguns minutos. Se persistir, fale com o suporte.' };
  }
  console.log('[teleconsulta] PIX criado:', charge.id, '| provider:', activePixProvider(), '| reminder:', reminder.id);
  const qrImg = charge.qrBase64 ? (charge.qrBase64.startsWith('data:') ? charge.qrBase64 : `data:image/png;base64,${charge.qrBase64}`) : '';
  if (subscriptionColumns.hasPixResume) {
    await updateSubscriptionCompat(sub.id, { mpPaymentId: charge.id, pixQrCode: charge.qrCode, pixQrBase64: qrImg, pixExpiresAt: expires });
  } else {
    await updateSubscriptionCompat(sub.id, { mpPaymentId: charge.id });
  }
  return {
    ok: true, reminderId: reminder.id, priceCents,
    paymentId: charge.id, qrCode: charge.qrCode, qrBase64: qrImg, expiresAt: expires.toISOString(),
  };
}

/** PIX vivo (não pago, não expirado) da teleconsulta — alimenta o `matched.payment` do
 *  GET /teleconsulta-queue/status sem criar ordem nova (cria quem não acha = POST billing). */
export async function findLiveTeleconsultaPix(reminderId: string, userId: string): Promise<TeleconsultaPixPending | null> {
  const existing = await prisma.subscription.findFirst({
    where: { userId, status: 'PENDING', mpPreferenceId: `teleconsulta_${reminderId}`, pixExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, mpPaymentId: true, pixQrCode: true, pixQrBase64: true, pixExpiresAt: true },
  }).catch(() => null); // drift: colunas pix* ausentes no legado → sem retomada (recria)
  if (!existing?.pixQrCode || !existing.pixExpiresAt) return null;
  return {
    id: existing.id, paymentId: existing.mpPaymentId ?? '', qrCode: existing.pixQrCode,
    qrBase64: existing.pixQrBase64 ?? '', expiresAt: existing.pixExpiresAt.toISOString(),
    priceCents: 0,
  };
}
