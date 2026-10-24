// E2E (supertest) — §19 BLOQUEADOR B1 (reabertura 24/10): "paciente ENTROU sem pagar
// numa consulta criada pelo médico com valor definido". Reprodução do fluxo REAL de
// criação pelo médico + matriz de bypass do spec §19 (UI path · API direta · link
// antigo · credencial anterior · legado/recorrência · gratuito).
//
// REGRA EXPLÍCITA (§19 B1): consultPriceCents>0 && !paidAt → SEMPRE 402 em TODOS os
// caminhos de join. Erro/ausência de integração de pagamento NÃO vira grátis (o 402 é
// o estado seguro). Sem LiveKit no env de teste o join pago/liberado responde 501
// LIVEKIT_UNAVAILABLE — nos asserts isso significa "passou do gate de pagamento".
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/prisma';
import { rollRecurringReminders } from '../src/jobs/reminderEmails';
import { buildJoinToken } from '../src/utils/livekit';
import { api, createUser, createDoctor, resetDb, authHeader } from './helpers';

const H2 = (t: string) => ({ Authorization: `Bearer ${t}` });
const IN_WINDOW = () => new Date(Date.now() + 2 * 60_000).toISOString(); // +2min: dentro da janela (entryWindowMin=5)
let seedSeq = 0;

/** Fluxo REAL do DoctorPortal: médico + share + POST /doctor/patients/:id/teleconsulta
 *  com o MESMO payload do scheduleTele (dueDate, linkUrl externo, consultPriceCents). */
async function seedTeleconsulta(body: Record<string, unknown> = {}) {
  const { user, patient, token } = await createUser();
  const crm = `${95000 + (seedSeq++ % 4000)}-SP`;
  const { token: docToken } = await createDoctor({ crm });
  await api().post('/api/doctor-shares').set(authHeader(token)).send({ doctorCrm: crm, scopes: ['exams'], patientId: patient.id });
  const post = await api().post(`/api/doctor/patients/${patient.id}/teleconsulta`).set(H2(docToken)).send({
    dueDate: IN_WINDOW(),
    title: 'Consulta particular',
    linkUrl: 'https://meet.example.com/sala',
    ...body,
  });
  if (post.status !== 201) throw new Error(`seedTeleconsulta: POST falhou ${post.status} ${JSON.stringify(post.body)}`);
  return { user, patient, token, docToken, reminder: post.body.reminder };
}

describe('B1 — paciente não entra sem pagar (todos os caminhos de join)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('UI path: médico agenda COM valor, dentro da janela → join do paciente 402 PAYMENT_REQUIRED (API direta e re-join = mesmo gate)', async () => {
    const { reminder, token } = await seedTeleconsulta({ consultPriceCents: 12000 }); // R$ 120,00 como o dialog
    const join = await api().get(`/api/teleconsulta/${reminder.id}/join`).set(authHeader(token));
    expect(join.status).toBe(402);
    expect(join.body.code).toBe('PAYMENT_REQUIRED');
    expect(join.body.priceCents).toBe(12000);
    // "link antigo" = join pelo MESMO id (link não substitui auth/gate): idêntico
    const again = await api().get(`/api/teleconsulta/${reminder.id}/join`).set(authHeader(token));
    expect(again.status).toBe(402);
    expect(again.body.code).toBe('PAYMENT_REQUIRED');
    // Médico SEM share não entra (link não substitui autorização)
    const otherDoc = await createDoctor({ crm: '99901-SP' });
    const docJoin = await api().get(`/api/teleconsulta/${reminder.id}/join`).set(H2(otherDoc.token));
    expect(docJoin.status).toBe(403);
  });

  it('pago (paidAt) → join passa do gate de pagamento (501 LIVEKIT_UNAVAILABLE no env de teste, NÃO 402)', async () => {
    const { reminder, token } = await seedTeleconsulta({ consultPriceCents: 12000 });
    await prisma.reminder.update({ where: { id: reminder.id }, data: { paidAt: new Date() } });
    const join = await api().get(`/api/teleconsulta/${reminder.id}/join`).set(authHeader(token));
    expect(join.status).not.toBe(402); // pagou → gate liberado
    expect(join.status).toBe(501); // sem LiveKit no teste → link externo
  });

  it('gratuito (sem preço) → join NÃO cobra (501, nunca 402) dentro da janela', async () => {
    const { reminder, token } = await seedTeleconsulta();
    expect(reminder.consultPriceCents ?? null).toBeNull();
    const join = await api().get(`/api/teleconsulta/${reminder.id}/join`).set(authHeader(token));
    expect(join.status).toBe(501);
  });

  it('BURACO — recorrência: ocorrência PAGA rola p/ próxima e levava o paidAt (entrada grátis na nova ocorrência)', async () => {
    const { reminder, token } = await seedTeleconsulta({ consultPriceCents: 12000, recurrence: 'diario' });
    // Ocorrência 1 aconteceu e foi paga (estado que o webhook deixa)
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { paidAt: new Date(Date.now() - 26 * 3600_000), paymentRef: 'pay_occ1', done: true, dueDate: new Date(Date.now() - 25 * 3600_000) },
    });
    await rollRecurringReminders(Date.now());
    const rolled = await prisma.reminder.findUnique({ where: { id: reminder.id }, select: { dueDate: true, done: true, paidAt: true, paymentRef: true, consultPriceCents: true } });
    expect(rolled?.done).toBe(false); // rolou de fato
    expect(rolled?.consultPriceCents).toBe(12000); // série continua COBRANDO
    // A PRÓXIMA ocorrência nasce NÃO-paga: o PIX da anterior não paga a nova (B1)
    expect(rolled?.paidAt).toBeNull();
    expect(rolled?.paymentRef).toBeNull();
    // Na hora da nova ocorrência (janela aberta) → 402, mesmo id/link antigo
    await prisma.reminder.update({ where: { id: reminder.id }, data: { dueDate: new Date(Date.now() + 2 * 60_000) } });
    const join = await api().get(`/api/teleconsulta/${reminder.id}/join`).set(authHeader(token));
    expect(join.status).toBe(402);
    expect(join.body.code).toBe('PAYMENT_REQUIRED');
  });

  it('credencial anterior: token LiveKit tem TTL ≤ 2h (token de uma entrada não alcança a próxima ocorrência) e o join re-checa por request', async () => {
    const prev = { ...process.env };
    process.env.LIVEKIT_API_KEY = 'testkey';
    process.env.LIVEKIT_API_SECRET = 'testsecret';
    try {
      const jwt = await buildJoinToken({ identity: 'patient:x', name: 'P', room: 'teleconsulta-x' });
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64').toString('utf8')) as { exp: number; video?: { roomJoin?: boolean } };
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(7200 + 10); // 2h (JOIN_TOKEN_TTL_SEC)
      expect(payload.video?.roomJoin).toBe(true);
    } finally {
      if (prev.LIVEKIT_API_KEY === undefined) delete process.env.LIVEKIT_API_KEY; else process.env.LIVEKIT_API_KEY = prev.LIVEKIT_API_KEY;
      if (prev.LIVEKIT_API_SECRET === undefined) delete process.env.LIVEKIT_API_SECRET; else process.env.LIVEKIT_API_SECRET = prev.LIVEKIT_API_SECRET;
    }
  });

  it('lista do paciente NÃO entrega o link externo de consulta paga-pendente (join fora do gate)', async () => {
    const { user, reminder, token } = await seedTeleconsulta({ consultPriceCents: 12000, linkUrl: 'https://meet.example.com/secreta' });
    const list = await api().get('/api/reminders').set(authHeader(token));
    expect(list.status).toBe(200);
    const row = (list.body as any[]).find((r) => r.id === reminder.id);
    expect(row).toBeTruthy();
    expect(row.linkUrl).toBeNull(); // não paga → sem link (o 402 do /join é o único caminho)
    expect(row.consultPriceCents).toBe(12000); // client ainda sabe que há cobrança
    // Paga → link volta (o produto foi entregue)
    await prisma.reminder.update({ where: { id: reminder.id }, data: { paidAt: new Date() } });
    const list2 = await api().get('/api/reminders').set(authHeader(token));
    const row2 = (list2.body as any[]).find((r) => r.id === reminder.id);
    expect(row2.linkUrl).toBe('https://meet.example.com/secreta');
    expect(user.id).toBeTruthy();
  });
});
