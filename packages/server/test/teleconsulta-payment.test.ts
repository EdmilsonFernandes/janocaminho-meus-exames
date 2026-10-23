// E2E (supertest) — Cobrança de consulta particular (23/10/26): médico define valor →
// paciente paga no app (PIX MP mockado) → webhook marca paidAt/paymentRef no Reminder.
// v1: join NÃO é bloqueado por pagamento (cobrança é confiança, não gate) e o repasse
// ao médico é fora do app (sem split). Padrão: copiado do teleconsulta-doctor-note.test.
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { prisma } from '../src/prisma';
import { api, createUser, createDoctor, resetDb, authHeader, mpResponse } from './helpers';

const fetchMock = () => globalThis.fetch as unknown as Mock;
const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });
const FUTURE = () => new Date(Date.now() + 24 * 3600_000).toISOString();
let seedSeq = 0; // CRMs únicos por seed (register 409 em CRM/e-mail duplicado no mesmo teste)

/** Médico FREE + paciente com share; teleconsulta criada pela API do portal (fluxo real). */
async function seedTeleconsulta(body: Record<string, unknown> = {}) {
  const { user, patient, token } = await createUser();
  const crm = `${90000 + (seedSeq++ % 9000)}-SP`;
  const { token: docToken } = await createDoctor({ crm }); // e-mail uniq() do helper
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });
  const post = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(docToken)).send({ dueDate: FUTURE(), title: 'Tele paga', linkUrl: 'https://meet.example.com/sala', ...body });
  if (post.status !== 201) throw new Error(`seedTeleconsulta: POST falhou ${post.status} ${JSON.stringify(post.body)}`);
  return { user, patient, token, docToken, reminder: post.body.reminder };
}

describe('Cobrança de consulta particular (teleconsulta)', () => {
  beforeEach(async () => {
    await resetDb();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue(mpResponse({})); // default seguro p/ qualquer fetch
  });

  it('médico FREE define valor padrão (preço NÃO é feature Pro); inválido → 400', async () => {
    const { doctor: freeDoc, token: docToken } = await createDoctor({ crm: '91001-SP' });
    const put = await api().put('/api/doctor/me').set(H2(docToken)).send({ consultPriceCents: 15000 });
    expect(put.status).toBe(200);
    expect(put.body.doctor.consultPriceCents).toBe(15000);
    const row = await prisma.doctor.findUnique({ where: { id: freeDoc.id }, select: { consultPriceCents: true, plan: true } });
    expect(row?.consultPriceCents).toBe(15000);
    expect(row?.plan).toBe('free'); // sem gate Pro — qualquer médico define
    // Abaixo do mínimo do PIX (R$ 5,00) → 400, não salva
    const bad = await api().put('/api/doctor/me').set(H2(docToken)).send({ consultPriceCents: 300 });
    expect(bad.status).toBe(400);
    // 0 = sem cobrança (limpa o padrão)
    const zero = await api().put('/api/doctor/me').set(H2(docToken)).send({ consultPriceCents: 0 });
    expect(zero.status).toBe(200);
    expect(zero.body.doctor.consultPriceCents).toBeNull();
  });

  it('POST teleconsulta congela o valor no Reminder; sem preço = sem cobrança; inválido → 400', async () => {
    const a = await seedTeleconsulta({ consultPriceCents: 25000 });
    expect(a.reminder.consultPriceCents).toBe(25000);
    const row = await prisma.reminder.findUnique({ where: { id: a.reminder.id }, select: { consultPriceCents: true, paidAt: true, paymentRef: true } });
    expect(row?.consultPriceCents).toBe(25000);
    expect(row?.paidAt).toBeNull();
    expect(row?.paymentRef).toBeNull();
    // Sem o campo → sem cobrança (null; server NÃO aplica default sozinho — quem envia é o dialog)
    const b = await seedTeleconsulta();
    expect(b.reminder.consultPriceCents ?? null).toBeNull();
    // Valor inválido no agendamento → 400 (não cria meia-consulta)
    const bad = await api().post(`/api/doctor/patients/${a.patient.id}/teleconsulta`).set(H2(a.docToken)).send({ dueDate: FUTURE(), title: 'Bad', linkUrl: 'https://meet.example.com/x', force: true, consultPriceCents: 100 });
    expect(bad.status).toBe(400);
  });

  it('paciente cria cobrança PIX (MP mockado) + retomada devolve o MESMO QR (409)', async () => {
    const { user, token, reminder } = await seedTeleconsulta({ consultPriceCents: 15000 });
    fetchMock().mockResolvedValueOnce(mpResponse({ id: 'pay_tele_1', point_of_interaction: { transaction_data: { qr_code: 'PIXCODE123', qr_code_base64: 'AAAA' } } }));
    const r = await api().post(`/api/billing/teleconsulta/${reminder.id}`).set(authHeader(token));
    expect(r.status).toBe(200);
    expect(r.body.paymentId).toBe('pay_tele_1');
    expect(r.body.qrCode).toBe('PIXCODE123');
    expect(r.body.priceCents).toBe(15000);
    expect(r.body.reminderId).toBe(reminder.id);
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    expect(sub?.status).toBe('PENDING');
    expect(sub?.mpPreferenceId).toBe(`teleconsulta_${reminder.id}`);
    expect(sub?.mpPaymentId).toBe('pay_tele_1');
    // RETOMADA (padrão gateway): PIX vivo → 409 com o mesmo QR, SEM ordem nova
    const again = await api().post(`/api/billing/teleconsulta/${reminder.id}`).set(authHeader(token));
    expect(again.status).toBe(409);
    expect(again.body.pendingPix?.qrCode).toBe('PIXCODE123');
    expect(await prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it('webhook aprova → paidAt/paymentRef no Reminder + Subscription APPROVED; idempotente', async () => {
    const { user, token, reminder } = await seedTeleconsulta({ consultPriceCents: 15000 });
    const creditsBefore = (await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } }))!.credits; // share de exames já debitou
    fetchMock().mockResolvedValueOnce(mpResponse({ id: 'pay_tele_2', point_of_interaction: { transaction_data: { qr_code: 'QR2', qr_code_base64: 'BB' } } }));
    const r = await api().post(`/api/billing/teleconsulta/${reminder.id}`).set(authHeader(token));
    expect(r.status).toBe(200);
    const sub = await prisma.subscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    // Webhook MP: pagamento aprovado com external_reference subId|0|TELE:<reminderId>
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: `${sub!.id}|0|TELE:${reminder.id}` }));
    const wh = await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay_tele_2' } });
    expect(wh.status).toBe(200);
    const row = await prisma.reminder.findUnique({ where: { id: reminder.id }, select: { paidAt: true, paymentRef: true } });
    expect(row?.paidAt).toBeTruthy();
    expect(row?.paymentRef).toBe('pay_tele_2');
    const subA = await prisma.subscription.findUnique({ where: { id: sub!.id }, select: { status: true } });
    expect(subA?.status).toBe('APPROVED');
    // Não creditou NADA no app (é pagamento de serviço, não saldo — créditos intactos)
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } });
    expect(u?.credits).toBe(creditsBefore);
    // Idempotência: reenvio do webhook não remarca/recredita nada
    fetchMock().mockResolvedValueOnce(mpResponse({ status: 'approved', external_reference: `${sub!.id}|0|TELE:${reminder.id}` }));
    await api().post('/api/billing/webhook').send({ type: 'payment', data: { id: 'pay_tele_2' } });
    const row2 = await prisma.reminder.findUnique({ where: { id: reminder.id }, select: { paidAt: true, paymentRef: true } });
    expect(row2?.paymentRef).toBe('pay_tele_2');
  });

  it('cobrança de outro paciente → 404; consulta sem preço → 400; já paga → 409', async () => {
    const { token, reminder } = await seedTeleconsulta({ consultPriceCents: 15000 });
    const stranger = await createUser();
    // paciente não-pago NÃO vê (nem cria) cobrança de outro
    const denied = await api().post(`/api/billing/teleconsulta/${reminder.id}`).set(authHeader(stranger.token));
    expect(denied.status).toBe(404);
    // consulta sem cobrança
    const free = await seedTeleconsulta();
    const noPrice = await api().post(`/api/billing/teleconsulta/${free.reminder.id}`).set(authHeader(free.token));
    expect(noPrice.status).toBe(400);
    // já paga (webhook marcou antes) → 409 sem gerar nova ordem
    await prisma.reminder.update({ where: { id: reminder.id }, data: { paidAt: new Date() } });
    const paid = await api().post(`/api/billing/teleconsulta/${reminder.id}`).set(authHeader(token));
    expect(paid.status).toBe(409);
    expect(String(paid.body.error)).toContain('já paga');
  });
});
